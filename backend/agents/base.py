"""
agent-service/agents/base.py

Abstract base class all agents inherit from.
Provides a uniform interface:
    result = await agent.run(input_text, session_id, uid, language)

Concrete agents (job_posting, job_search, admin_query) override `_build_graph`
to return their compiled LangGraph StateGraph.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

from sessions import get_session_store, ConversationSession

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """
    Abstract LangGraph agent.

    Subclasses must implement:
        _build_graph() → compiled LangGraph application
        _initial_state(input_text, session, **kwargs) → dict  (LangGraph input)
        _extract_response(final_state) → dict  (API response payload)
    """

    #: Override in subclass with a short name, e.g. "job_posting"
    agent_name: str = "base"

    def __init__(self) -> None:
        self._graph = self._build_graph()

    @abstractmethod
    def _build_graph(self):
        """Return a compiled LangGraph StateGraph."""
        ...

    @abstractmethod
    def _initial_state(
        self,
        input_text: str,
        session: ConversationSession,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Build the initial state dict passed to graph.invoke()."""
        ...

    @abstractmethod
    def _extract_response(self, final_state: dict[str, Any]) -> dict[str, Any]:
        """Pull the user-facing fields out of the final graph state."""
        ...

    async def run(
        self,
        input_text: str,
        session_id: str,
        uid: str,
        language: str = "en",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Entry point called by FastAPI route handlers.

        1. Load (or create) the session.
        2. Build the graph input state from the session + new input.
        3. Invoke the LangGraph graph.
        4. Persist the updated state back to the session store.
        5. Return the extracted response dict.
        """
        store = get_session_store()

        # Load or create session
        session = await store.get(session_id)
        if session is None:
            session = await store.create_session(
                session_id=session_id,
                agent_name=self.agent_name,
                user_uid=uid,
                language=language,
            )

        # Build LangGraph input
        graph_input = self._initial_state(input_text, session, **kwargs)

        try:
            # Invoke the compiled graph
            final_state = await self._graph.ainvoke(graph_input)
        except Exception as exc:
            logger.error("[%s] Graph invocation error: %s", self.agent_name, exc)
            raise

        # Persist updated state
        session.state = dict(final_state)
        session.touch()
        await store.set(session)

        return self._extract_response(final_state)

    async def reset_session(self, session_id: str) -> None:
        """Clear the session state (e.g. when user starts over)."""
        store = get_session_store()
        await store.delete(session_id)
        logger.debug("[%s] Session %s cleared", self.agent_name, session_id)
