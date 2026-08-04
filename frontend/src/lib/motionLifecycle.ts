type MotionLifecycleDependencies = {
  startMotion: () => () => void;
  setMotionState: (reduced: boolean) => void;
  setReady: (ready: boolean) => void;
  clearDocumentState: () => void;
  killAllScrollTriggers: () => void;
};

export function createMotionLifecycle({
  startMotion,
  setMotionState,
  setReady,
  clearDocumentState,
  killAllScrollTriggers,
}: MotionLifecycleDependencies) {
  let stopOwnedMotion: (() => void) | undefined;

  const stopMotion = () => {
    stopOwnedMotion?.();
    stopOwnedMotion = undefined;
    setReady(false);
  };

  return {
    apply(reduced: boolean) {
      stopMotion();
      setMotionState(reduced);

      if (reduced) return;

      stopOwnedMotion = startMotion();
      setReady(true);
    },
    destroy() {
      stopMotion();
      killAllScrollTriggers();
      clearDocumentState();
    },
  };
}
