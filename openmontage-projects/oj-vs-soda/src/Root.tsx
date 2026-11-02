import React from "react";
import { Composition } from "remotion";
import { OJShort } from "./OJShort";
import timing from "./timing.json";
export const Root: React.FC = () => (
  <Composition id="OJShort" component={OJShort} durationInFrames={timing.durationInFrames} fps={30} width={1080} height={1920} />
);
