import { useCallback, useMemo } from "react";
import { CanvasStrip } from "./CanvasStrip";
import { safeCanvasColor, fillRoundedRect } from "@/utils/canvasColor";
import {
  getBarGeometry,
  getBarSlot,
  healthBarInteractionModel,
  healthBarSlotModel,
} from "./nodeCardShared";
import type { PingOverviewBucket } from "@/types/cfsm";

interface QualityBarsProps {
  buckets: PingOverviewBucket[];
  redrawKey?: string;
  height?: number;
  onHoverIndex?: (index: number | null) => void;
}

export function QualityBars({ buckets, redrawKey, height = 8, onHoverIndex }: QualityBarsProps) {
  const bars = useMemo(() => {
    void redrawKey;
    return buckets.map((bucket) => {
      const slot = healthBarSlotModel(bucket, "loss");
      return { ...slot, tone: safeCanvasColor(slot.color) };
    });
  }, [buckets, redrawKey]);

  const getHoverIndex = useCallback(
    (offsetX: number, width: number) => getBarSlot(offsetX, width, bars.length),
    [bars],
  );

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, interaction: { hoverIndex: number | null; hoverProgress: number }) => {
      const { gap, barWidth } = getBarGeometry(width, bars.length);
      bars.forEach(({ heightFraction, alpha, tone }, index) => {
        const visual = healthBarInteractionModel(
          { active: true, heightFraction, color: tone, alpha },
          interaction.hoverIndex === index,
          interaction.hoverProgress,
        );
        const barHeight = height * visual.heightFraction;
        const x = index * (barWidth + gap);
        const y = height - barHeight;
        ctx.globalAlpha = visual.alpha;
        ctx.fillStyle = tone;
        fillRoundedRect(ctx, x, y, barWidth, barHeight, 1);
      });
      ctx.globalAlpha = 1;
    },
    [bars],
  );

  return (
    <CanvasStrip
      height={height}
      redrawKey={redrawKey}
      getHoverIndex={getHoverIndex}
      onHoverIndex={onHoverIndex}
      draw={draw}
    />
  );
}
