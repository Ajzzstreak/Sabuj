import React from "react";
import { Composition, Still } from "remotion";
import { FruitShort } from "./Composition";
import { ThumbSugarBomb, ThumbVersus, ThumbTier, ThumbSugarBombWide } from "./Thumbnails";
import timing from "./timing.json";
import timingV3 from "./timing_v3.json";
import { FruitShortV3 } from "./CompositionV3";

export const Root: React.FC = () => (
  <>
    <Composition id="FruitShort" component={FruitShort} durationInFrames={timing.durationInFrames}
      fps={30} width={1080} height={1920} />
    <Composition id="FruitShortV3" component={FruitShortV3} durationInFrames={timingV3.durationInFrames}
      fps={30} width={1080} height={1920} />
    <Still id="ThumbSugarBomb" component={ThumbSugarBomb} width={1080} height={1920} />
    <Still id="ThumbVersus" component={ThumbVersus} width={1080} height={1920} />
    <Still id="ThumbTier" component={ThumbTier} width={1080} height={1920} />
    <Still id="ThumbSugarBombWide" component={ThumbSugarBombWide} width={1280} height={720} />
  </>
);
