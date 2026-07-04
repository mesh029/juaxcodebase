import { useState } from 'react';
import { AuthScreen } from '../../AuthScreen';
import { OnboardingSlides } from './OnboardingSlides';
import { WelcomeScreen } from './WelcomeScreen';

type AuthMode = 'signin' | 'signup';
type Phase = 'slides' | 'welcome' | 'auth';

type Props = {
  onComplete: () => void;
};

export function OnboardingFlow({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('slides');
  const [authMode, setAuthMode] = useState<AuthMode>('signup');

  if (phase === 'auth') {
    return (
      <AuthScreen
        mode={authMode}
        onBack={() => setPhase('welcome')}
        onComplete={onComplete}
      />
    );
  }

  if (phase === 'welcome') {
    return (
      <WelcomeScreen
        onSignUp={() => {
          setAuthMode('signup');
          setPhase('auth');
        }}
        onSignIn={() => {
          setAuthMode('signin');
          setPhase('auth');
        }}
      />
    );
  }

  return (
    <OnboardingSlides
      onDone={() => setPhase('welcome')}
      onSkip={() => setPhase('welcome')}
    />
  );
}
