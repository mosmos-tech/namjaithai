import { Urgency } from "./enums";

export interface PriorityInput {
  urgency: Urgency;
  bedridden: number; // ผู้ป่วยติดเตียง
  children: number; // เด็กเล็ก
}

// คะแนนฐานตามสีเว้นช่องห่างมากพอ เพื่อให้ RED > YELLOW > GREEN แม้บวกคะแนนพิเศษ
const BASE_SCORE: Record<Urgency, number> = {
  [Urgency.RED]: 10000,
  [Urgency.YELLOW]: 1000,
  [Urgency.GREEN]: 100,
};

// ผู้ป่วยติดเตียงและเด็กเล็กเพิ่มความเร่งด่วนภายในสีเดียวกัน
const BEDRIDDEN_BONUS = 10;
const CHILD_BONUS = 5;

export function priorityScore(input: PriorityInput): number {
  return (
    BASE_SCORE[input.urgency] +
    input.bedridden * BEDRIDDEN_BONUS +
    input.children * CHILD_BONUS
  );
}
