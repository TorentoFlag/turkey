export type CanvasController = {
  resize(): void;
  destroy(): void;
};

export type HeroSceneController = CanvasController & {
  setScrollVelocity(velocity: number): void;
};

export type DirectionSceneController = CanvasController & {
  setScene(index: number, nextIndex: number, blend: number): void;
};

export type RendererOptions = {
  maxDpr: number;
  onFailure(): void;
};
