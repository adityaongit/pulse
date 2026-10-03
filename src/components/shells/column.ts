/**
 * The content column's width: full on phone, 720 px on tablet, 1120 px on laptop, 1280 px from 1536 px (spec §2.5, §11 D-L1).
 * The page column and every header row use it, so back, title, info and sync sit on the column's edges at every width (D-L2).
 * A plain module (no "use client"), so server shells and client headers share the one value.
 */
export const COLUMN_WIDTH = "md:mx-auto md:max-w-[720px] xl:max-w-[1120px] 2xl:max-w-[1280px]"
