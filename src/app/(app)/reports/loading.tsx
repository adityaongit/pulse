import { DetailShell } from "@/components/shells/DetailShell"
import { LinkListSkeleton, LIST_GRID } from "@/components/shells/LinkList"

const rows = (n: number) => Array.from({ length: n }, () => ({ label: "" }))

/** Reports archive: the Weeks and Months groups with row boxes at their final size (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell
      title="Reports"
      primary={
        <div className={LIST_GRID}>
          <LinkListSkeleton title="Weeks" rows={rows(8)} />
          <LinkListSkeleton title="Months" rows={rows(4)} />
        </div>
      }
    />
  )
}
