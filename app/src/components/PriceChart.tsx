import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { PricePoint, RetailerId } from '@/api/contract';
import { money, moneyShort, shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { getRetailer, RETAILER_ORDER } from '@/lib/retailers';
import { chartSeries, continuous, radius, space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

const HEIGHT = 210;
const PAD = { top: 12, right: 14, bottom: 26, left: 50 };
const TOOLTIP_W = 178;

interface Series {
  id: RetailerId;
  points: { t: number; date: string; price: number }[];
  low: number;
  high: number;
  last: number;
}

const dayMs = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * Price history: one line per retailer on a single dollar axis. Drag or hover
 * to read exact prices; tap a row in the table below to hide or show a store.
 */
export function PriceChart({ history }: { history: PricePoint[] }) {
  const { c, scheme } = useTheme();
  const colors = chartSeries[scheme];
  const [width, setWidth] = useState(0);
  const [hidden, setHidden] = useState<RetailerId[]>([]);
  const [hover, setHover] = useState<number | null>(null);

  const { series, dates } = useMemo(() => {
    const by = new Map<RetailerId, Series['points']>();
    const dateSet = new Set<string>();
    for (const p of history) {
      const t = dayMs(p.date);
      if (Number.isNaN(t) || !Number.isFinite(p.price)) continue;
      dateSet.add(p.date.slice(0, 10));
      const list = by.get(p.retailerId) ?? [];
      list.push({ t, date: p.date.slice(0, 10), price: p.price });
      by.set(p.retailerId, list);
    }
    const out: Series[] = [];
    for (const id of RETAILER_ORDER) {
      const points = by.get(id);
      if (!points?.length) continue;
      points.sort((a, b) => a.t - b.t);
      const prices = points.map((p) => p.price);
      out.push({ id, points, low: Math.min(...prices), high: Math.max(...prices), last: prices[prices.length - 1] ?? 0 });
    }
    return { series: out, dates: [...dateSet].sort() };
  }, [history]);

  const visible = useMemo(() => series.filter((s) => !hidden.includes(s.id)), [series, hidden]);

  const scale = useMemo(() => {
    const t0 = dayMs(dates[0] ?? '');
    const t1 = dayMs(dates[dates.length - 1] ?? '');
    const source = visible.length ? visible : series;
    const lo = Math.min(...source.map((s) => s.low));
    const hi = Math.max(...source.map((s) => s.high));
    const pad = Math.max((hi - lo) * 0.12, hi * 0.01, 0.5);
    const ticks = niceTicks(lo - pad, hi + pad);
    const y0 = ticks[0] ?? lo;
    const y1 = ticks[ticks.length - 1] ?? hi;
    const plotW = Math.max(1, width - PAD.left - PAD.right);
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    return {
      ticks,
      x: (t: number) => PAD.left + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW),
      y: (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0 || 1)) * plotH,
    };
  }, [dates, visible, series, width]);

  const lowest = useMemo(() => {
    let best: { price: number; id: RetailerId; date: string } | null = null;
    for (const s of series) for (const p of s.points) if (!best || p.price < best.price) best = { price: p.price, id: s.id, date: p.date };
    return best;
  }, [series]);

  const pick = useCallback(
    (px: number) => {
      if (!dates.length) return;
      let nearest = 0;
      let dist = Number.POSITIVE_INFINITY;
      dates.forEach((d, i) => {
        const dx = Math.abs(scale.x(dayMs(d)) - px);
        if (dx < dist) {
          dist = dx;
          nearest = i;
        }
      });
      setHover((prev) => {
        if (prev !== nearest) haptic.selection();
        return nearest;
      });
    },
    [dates, scale],
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const onTouch = (e: GestureResponderEvent) => pick(e.nativeEvent.locationX);

  if (series.length === 0 || dates.length < 2) {
    return (
      <Text variant="callout" tone="textSecondary">
        Not enough price history yet. Check back after a few days of tracking.
      </Text>
    );
  }

  const hoverDate = hover != null ? dates[hover] : undefined;
  const hoverX = hoverDate ? scale.x(dayMs(hoverDate)) : 0;
  const hoverRows = hoverDate
    ? visible
        .map((s) => ({ id: s.id, price: s.points.find((p) => p.date === hoverDate)?.price }))
        .filter((r): r is { id: RetailerId; price: number } => r.price != null)
        .sort((a, b) => a.price - b.price)
    : [];
  const tooltipLeft = Math.min(Math.max(hoverX + 12 + TOOLTIP_W > width ? hoverX - 12 - TOOLTIP_W : hoverX + 12, 0), Math.max(0, width - TOOLTIP_W));
  const first = dates[0] ?? '';
  const last = dates[dates.length - 1] ?? '';
  const mid = dates[Math.floor((dates.length - 1) / 2)] ?? '';

  return (
    <View>
      {lowest ? (
        <Text variant="callout" tone="textSecondary" style={styles.summary}>
          Lowest since {shortDate(first)}:{' '}
          <Text variant="calloutStrong">
            {money(lowest.price)} at {getRetailer(lowest.id).name}
          </Text>{' '}
          on {shortDate(lowest.date)}
        </Text>
      ) : null}

      <View
        onLayout={onLayout}
        style={styles.plot}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Price history line chart for ${series.length} stores from ${shortDate(first)} to ${shortDate(last)}.${
          lowest ? ` Lowest ${money(lowest.price)} at ${getRetailer(lowest.id).name} on ${shortDate(lowest.date)}.` : ''
        } Per-store figures are in the table below.`}
      >
        {width > 0 ? (
          <>
            <Svg width={width} height={HEIGHT}>
              {scale.ticks.map((tick) => (
                <Line key={tick} x1={PAD.left} x2={width - PAD.right} y1={scale.y(tick)} y2={scale.y(tick)} stroke={c.border} strokeWidth={1} />
              ))}
              {hoverDate ? <Line x1={hoverX} x2={hoverX} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke={c.borderStrong} strokeWidth={1} /> : null}
              {visible.map((s) => (
                <Path
                  key={s.id}
                  d={s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scale.x(p.t).toFixed(1)},${scale.y(p.price).toFixed(1)}`).join(' ')}
                  stroke={colors[s.id]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill="none"
                />
              ))}
              {visible.map((s) => {
                const p = hoverDate ? s.points.find((pt) => pt.date === hoverDate) : s.points[s.points.length - 1];
                return p ? <Circle key={s.id} cx={scale.x(p.t)} cy={scale.y(p.price)} r={4} fill={colors[s.id]} stroke={c.surface} strokeWidth={2} /> : null;
              })}
            </Svg>

            {scale.ticks.map((tick) => (
              <Text key={tick} variant="caption" tone="textTertiary" allowFontScaling={false} style={[styles.yLabel, { top: scale.y(tick) - 8 }]}>
                {moneyShort(tick)}
              </Text>
            ))}
            <View style={styles.xLabels} pointerEvents="none">
              {[first, mid, last].map((d, i) => (
                <Text key={`${d}-${i}`} variant="caption" tone="textTertiary" allowFontScaling={false}>
                  {shortDate(d)}
                </Text>
              ))}
            </View>

            {/* Interaction layer: larger than any mark, so the nearest day is always easy to hit. */}
            <View
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              onResponderTerminationRequest={() => true}
              onResponderGrant={onTouch}
              onResponderMove={onTouch}
              onResponderRelease={() => setHover(null)}
              onResponderTerminate={() => setHover(null)}
              onPointerMove={(e) => {
                const ne = e.nativeEvent as unknown as { offsetX?: number; pointerType?: string };
                if (ne.pointerType === 'mouse' && typeof ne.offsetX === 'number') pick(ne.offsetX);
              }}
              onPointerLeave={() => setHover(null)}
            />

            {hoverDate && hoverRows.length ? (
              <View pointerEvents="none" style={[styles.tooltip, continuous, { left: tooltipLeft, backgroundColor: c.surface, borderColor: c.borderStrong }]}>
                <Text variant="captionStrong" tone="textSecondary" style={{ marginBottom: 4 }}>
                  {shortDate(hoverDate)}
                </Text>
                {hoverRows.map((r, i) => (
                  <View key={r.id} style={styles.tooltipRow}>
                    <View style={[styles.key, { backgroundColor: colors[r.id] }]} />
                    <Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>
                      {getRetailer(r.id).name}
                    </Text>
                    <Text variant="priceSmall" tone={i === 0 ? 'best' : 'text'} style={{ fontSize: 13 }}>
                      {money(r.price)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {/* Legend and table view in one: tap a store to hide or show its line. */}
      <View style={[styles.table, { borderTopColor: c.border }]}>
        <View style={styles.tableHead}>
          <Text variant="caption" tone="textTertiary" style={styles.cellName}>
            Store
          </Text>
          {['Now', 'Low', 'High'].map((h) => (
            <Text key={h} variant="caption" tone="textTertiary" style={styles.cell}>
              {h}
            </Text>
          ))}
        </View>
        {series.map((s) => {
          const off = hidden.includes(s.id);
          const name = getRetailer(s.id).name;
          return (
            <PressableScale
              key={s.id}
              scaleTo={0.99}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !off }}
              accessibilityLabel={`${name}. Now ${money(s.last)}, low ${money(s.low)}, high ${money(s.high)}. ${off ? 'Hidden' : 'Shown'} on chart`}
              onPress={() => {
                haptic.selection();
                setHidden((prev) => (off ? prev.filter((id) => id !== s.id) : prev.length >= series.length - 1 ? prev : [...prev, s.id]));
              }}
              style={[styles.tableRow, off && { opacity: 0.45 }]}
            >
              <View style={styles.cellName}>
                <View style={[styles.keyLine, { backgroundColor: off ? c.fillStrong : colors[s.id] }]} />
                <Text variant="footnoteStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {name}
                </Text>
              </View>
              <Text variant="priceSmall" style={styles.cell}>
                {money(s.last)}
              </Text>
              <Text variant="priceSmall" tone={lowest && s.low === lowest.price ? 'best' : 'textSecondary'} style={styles.cell}>
                {money(s.low)}
              </Text>
              <Text variant="priceSmall" tone="textSecondary" style={styles.cell}>
                {money(s.high)}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { marginBottom: space.md },
  plot: { height: HEIGHT, width: '100%' },
  yLabel: { position: 'absolute', left: 0, width: PAD.left - 8, textAlign: 'right', fontVariant: ['tabular-nums'] },
  xLabels: { position: 'absolute', left: PAD.left, right: PAD.right, bottom: 2, flexDirection: 'row', justifyContent: 'space-between' },
  tooltip: { position: 'absolute', top: 4, width: TOOLTIP_W, borderRadius: radius.sm + 2, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8, gap: 3 },
  tooltipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  key: { width: 8, height: 8, borderRadius: 4 },
  keyLine: { width: 14, height: 4, borderRadius: 2 },
  table: { marginTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  tableHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  cellName: { flex: 1.5, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cell: { flex: 1, textAlign: 'right' },
});
