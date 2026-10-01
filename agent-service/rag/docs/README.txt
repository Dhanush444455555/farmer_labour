Place labour rights PDF or text documents here.

Supported formats: .txt  .md  .pdf

Run the seed script to ingest them:
    cd agent-service
    python rag/seed.py

Examples of documents to add:
  - Tamil Nadu Labour Department minimum wage notification (PDF)
  - Karnataka Agricultural Workers Act (PDF)
  - MGNREGA guidelines (PDF)
  - State-specific wage rate circulars (TXT/PDF)

After adding files, re-run:
    python rag/seed.py --docs rag/docs --clear
