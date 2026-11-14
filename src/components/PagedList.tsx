import { useEffect, useState, type ReactNode } from "react";
export function PagedList<T>({
  items,
  label,
  pageSize,
  selectedIndex,
  children,
}: {
  items: readonly T[];
  label: string;
  pageSize: number;
  selectedIndex?: number;
  children: (visible: T[]) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize)),
    current = Math.min(page, pages - 1),
    start = current * pageSize;
  useEffect(() => {
    setPage(0);
  }, [items]);
  useEffect(() => {
    if (selectedIndex !== undefined && selectedIndex >= 0)
      setPage(Math.floor(selectedIndex / pageSize));
  }, [selectedIndex, pageSize]);
  return (
    <div className="paged-list">
      {items.length > pageSize && (
        <div className="pagination" aria-label={label + " ページ操作"}>
          <span>
            {label} {start + 1}〜{Math.min(start + pageSize, items.length)} /{" "}
            {items.length}件
          </span>
          <button
            disabled={!current}
            onClick={() => setPage(current - 1)}
            aria-label={label + " 前へ"}
          >
            前へ
          </button>
          <button
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            aria-label={label + " 次へ"}
          >
            次へ
          </button>
        </div>
      )}
      {children(items.slice(start, start + pageSize))}
    </div>
  );
}
