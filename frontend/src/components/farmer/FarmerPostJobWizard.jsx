import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../services/api';
import StepWizardContainer from '../common/StepWizardContainer';
import StepWorkType from './post_job_wizard/StepWorkType';
import StepWorkerCount from './post_job_wizard/StepWorkerCount';
import StepWageSelection from './post_job_wizard/StepWageSelection';
import StepDateLocation from './post_job_wizard/StepDateLocation';
import StepJobConfirm from './post_job_wizard/StepJobConfirm';
import VoiceInputButton from '../common/VoiceInputButton';
import { parseVoiceJobDetails } from '../../utils/voiceJobParser';

const stepVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15, ease: 'easeIn' } }
};

export default function FarmerPostJobWizard({ user, onComplete, onCancel }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [voiceToast, setVoiceToast] = useState('');

  const [formData, setFormData] = useState({
    workType: 'Harvesting',
    workerCount: 3,
    genderPreference: 'Any',
    dailyWage: 500,
    dateOption: 'Tomorrow Morning',
    location: user?.location || ''
  });

  const handleNext = () => {
    setStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    if (step === 1) {
      onCancel();
    } else {
      setStep((prev) => Math.max(prev - 1, 1));
    }
  };

  const handleVoiceInput = (spokenText) => {
    const parsed = parseVoiceJobDetails(spokenText);
    if (Object.keys(parsed).length > 0) {
      setFormData((prev) => ({ ...prev, ...parsed }));
      setVoiceToast(`Understood: ${parsed.workType || ''} ${parsed.workerCount ? parsed.workerCount + ' workers' : ''} ${parsed.dailyWage ? '₹' + parsed.dailyWage : ''}`);
      setTimeout(() => setVoiceToast(''), 4000);
      if (parsed.workType && parsed.workerCount) {
        setStep(5);
      }
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await api.createWorkAlert(user.uid, {
        workType: formData.workType,
        workersCount: formData.workerCount,
        genderPreference: formData.genderPreference,
        wage: formData.dailyWage,
        date: formData.dateOption === 'Tomorrow Morning' ? 'Tomorrow' : 'Today',
        location: formData.location || 'Local Farm'
      });
      onComplete();
    } catch (err) {
      console.error('Error creating job:', err);
      alert('Failed to post job: ' + (err.message || 'Please try again.'));
    }
    setLoading(false);
  };

  const getStepTitle = () => {
    switch (step) {
      case 1:
        return t('farmer.step_1_title', 'Step 1: What work is needed?');
      case 2:
        return t('farmer.step_2_title', 'Step 2: How many workers?');
      case 3:
        return t('farmer.step_3_title', 'Step 3: Daily wage per worker?');
      case 4:
        return t('farmer.step_4_title', 'Step 4: Timing & Location?');
      case 5:
        return t('farmer.step_5_title', 'Step 5: Confirm & Post Work');
      default:
        return '';
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Voice Assistant Pill */}
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-yellow-300 rounded-3xl p-3 shadow-md">
        <VoiceInputButton
          onSpeechResult={handleVoiceInput}
          label="Speak Job Details to Auto-Fill"
          hint='Say: "Need 3 workers tomorrow 500 rupees for harvesting"'
        />
        <AnimatePresence>
          {voiceToast && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="bg-emerald-600 text-white font-black text-sm p-2 rounded-xl text-center mt-2"
            >
              ✓ {voiceToast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <StepWizardContainer
        step={step}
        totalSteps={5}
        title={getStepTitle()}
        onBack={handleBack}
      >
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <StepWorkType
                selectedType={formData.workType}
                onSelect={(type) => {
                  setFormData((prev) => ({ ...prev, workType: type }));
                  handleNext();
                }}
              />
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <StepWorkerCount
                count={formData.workerCount}
                gender={formData.genderPreference}
                onChangeCount={(cnt) => setFormData((prev) => ({ ...prev, workerCount: cnt }))}
                onChangeGender={(g) => setFormData((prev) => ({ ...prev, genderPreference: g }))}
                onNext={handleNext}
              />
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <StepWageSelection
                wage={formData.dailyWage}
                onChangeWage={(w) => setFormData((prev) => ({ ...prev, dailyWage: w }))}
                onNext={handleNext}
              />
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <StepDateLocation
                dateOption={formData.dateOption}
                location={formData.location}
                onChangeDateOption={(opt) => setFormData((prev) => ({ ...prev, dateOption: opt }))}
                onChangeLocation={(loc) => setFormData((prev) => ({ ...prev, location: loc }))}
                onNext={handleNext}
              />
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step5"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <StepJobConfirm
                jobData={formData}
                onConfirm={handleConfirm}
                loading={loading}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </StepWizardContainer>
    </div>
  );
}
