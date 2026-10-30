import React from 'react';
import RadarFocusWrapper from '@/components/RadarFocusWrapper';
import { ScaleFadeBorder } from '@/components/AnimatedSpinningBorders';

type RadarProps = React.ComponentProps<typeof RadarFocusWrapper>;

interface AnimatedRadarProps extends RadarProps {
    fromScale?: number;
    fromScaleX?: number;
    fromScaleY?: number;
}

export default function AnimatedRadarFocusWrapper({
    fromScale,
    fromScaleX,
    fromScaleY,
    ...radarProps
}: AnimatedRadarProps) {
    return (
        <ScaleFadeBorder
            fromScale={fromScale}
            fromScaleX={fromScaleX}
            fromScaleY={fromScaleY}
        >
            <RadarFocusWrapper {...radarProps} />
        </ScaleFadeBorder>
    );
}
