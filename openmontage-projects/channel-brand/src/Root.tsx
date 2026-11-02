import React from "react";
import { Still } from "remotion";
import { Avatar, Banner, BannerGuide } from "./Brand";
import { ThumbJack, ThumbJuice } from "./ShortThumbs";
export const Root: React.FC = () => (
  <>
    <Still id="Banner" component={Banner} width={2560} height={1440} />
    <Still id="BannerGuide" component={BannerGuide} width={2560} height={1440} />
    <Still id="Avatar" component={Avatar} width={800} height={800} />
    <Still id="ThumbJack" component={ThumbJack} width={1080} height={1920} />
    <Still id="ThumbJuice" component={ThumbJuice} width={1080} height={1920} />
  </>
);
