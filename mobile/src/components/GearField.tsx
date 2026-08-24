import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

/**
 * The faint gear line-art the artboards run behind every screen. One gear is
 * drawn from the artboard's own path, then repeated at a few sizes and corners
 * at a whisper of opacity — green and blue, the scheme's two marks — so the
 * background reads the same on the light auth screens and under the blue
 * registration header without ever competing with the content.
 *
 * It fills its parent (position: absolute) and is laid out first, so children
 * sit on top. Pointer events are disabled so it never intercepts a touch.
 */

// The gear outline and its hub, exactly as the artboards draw them, centred on
// (150, 158) so a gear can be placed by its centre.
const GEAR =
  'M267.4 146.4L267.4 169.6L245.0 171.7L241.6 186.8L260.8 198.5L250.7 219.4L229.6 211.6L220.0 223.7L232.3 242.6L214.1 257.1L198.5 240.8L184.5 247.6L187.5 269.9L164.8 275.1L157.7 253.7L142.3 253.7L135.2 275.1L112.5 269.9L115.5 247.6L101.5 240.8L85.9 257.1L67.7 242.6L80.0 223.7L70.4 211.6L49.3 219.4L39.2 198.5L58.4 186.8L55.0 171.7L32.6 169.6L32.6 146.4L55.0 144.3L58.4 129.2L39.2 117.5L49.3 96.6L70.4 104.4L80.0 92.3L67.7 73.4L85.9 58.9L101.5 75.2L115.5 68.4L112.5 46.1L135.2 40.9L142.3 62.3L157.7 62.3L164.8 40.9L187.5 46.1L184.5 68.4L198.5 75.2L214.1 58.9L232.3 73.4L220.0 92.3L229.6 104.4L250.7 96.6L260.8 117.5L241.6 129.2L245.0 144.3Z';
const GEAR_CX = 150;
const GEAR_CY = 158;
const HUB = 42;

const GREEN = '#0F7B45';
const BLUE = '#1B4F8A';

function Gear({
  x,
  y,
  scale,
  colour,
  opacity,
}: {
  x: number;
  y: number;
  scale: number;
  colour: string;
  opacity: number;
}): React.JSX.Element {
  return (
    <G
      opacity={opacity}
      transform={`translate(${x}, ${y}) scale(${scale}) translate(${-GEAR_CX}, ${-GEAR_CY})`}
      fill="none"
      stroke={colour}
      strokeWidth={2.4}
      strokeLinejoin="round"
    >
      <Path d={GEAR} />
      <Circle cx={GEAR_CX} cy={GEAR_CY} r={HUB} />
    </G>
  );
}

/**
 * @param headerSafe when true the top gear is dropped, for screens whose blue
 *   header already fills the top band (the registration wizard).
 */
export function GearField({ headerSafe = false }: { headerSafe?: boolean }): React.JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Low centre — the large gear the artboards anchor the page on. */}
        <Gear x={230} y={690} scale={1.15} colour={GREEN} opacity={0.05} />
        {/* Off the right edge, mid-page. */}
        <Gear x={360} y={470} scale={0.8} colour={BLUE} opacity={0.045} />
        {/* Off the top-left, unless a header covers it. */}
        {headerSafe ? null : <Gear x={-40} y={40} scale={0.7} colour={GREEN} opacity={0.04} />}
      </Svg>
    </View>
  );
}
