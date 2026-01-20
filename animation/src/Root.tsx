import React from 'react';
import { Composition } from 'remotion';
import { MensaPromo } from './MensaPromo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MensaPromo"
        component={MensaPromo}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
