import React from "react";
import { Composition, Still } from "remotion";
import { TitanicThumb } from "./Thumb";
import { TitanicReview } from "./Composition";
import timing from "./timing.json";
import timingDoor from "./timing_door.json";
import { DoorShort } from "./DoorShort";
export const Root: React.FC = () => (
  <>
  <Still id="TitanicThumb" component={TitanicThumb} width={1280} height={720} />
  <Composition id="TitanicReview" component={TitanicReview} durationInFrames={timing.durationInFrames} fps={30} width={1920} height={1080} />
  <Composition id="DoorShort" component={DoorShort} durationInFrames={timingDoor.durationInFrames} fps={30} width={1080} height={1920} />
  </>
);
