import type { SeatType } from '@/types';
import type { SeatShape } from './SeatIcon';

// A free seat wears its type colour (same seatType tokens as the admin editor); any other state overrides it.
// Standard reuses the available tokens so a free standard seat matches the admin grid. Static strings: Tailwind scans text.
export const SEAT_TYPE_FILL: Record<SeatType, { icon: string; label: string }> = {
  standard: { icon: 'text-(--cp-seat-available)', label: 'text-(--cp-seat-available-text)' },
  vip: { icon: 'text-(--cp-seat-type-vip)', label: 'text-(--cp-seat-type-vip-text)' },
  couple: { icon: 'text-(--cp-seat-type-couple)', label: 'text-(--cp-seat-type-couple-text)' },
  recliner: {
    icon: 'text-(--cp-seat-type-recliner)',
    label: 'text-(--cp-seat-type-recliner-text)',
  },
};

export const shapeOf = (seatType: SeatType): SeatShape =>
  seatType === 'vip' ? 'vip' : seatType === 'couple' ? 'couple' : 'single';
