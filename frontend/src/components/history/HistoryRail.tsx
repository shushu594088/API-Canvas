import { Image as ImageIcon, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useStore } from "../../state/store";
import { relativeTime } from "../../lib/format";
import type { HistoryItem } from "../../lib/bridge";
import { IconButton } from "../ui/kit";
import styles from "./HistoryRail.module.css";

const RAIL_KEY = "api-canvas.ui.rail";

function ItemView({ item, active, collapsed }: { item: HistoryItem; active: boolean; collapsed: boolean }) {
  const { dispatch } = useStore();
  const select = () => dispatch({ type: "active-job", id: item.jobId });

  if (collapsed) {
    return (
      <button
        type="button"
        className={`${styles.iconItem} ${active ? styles.iconActive : ""}`}
        onClick={select}
        data-tip={item.prompt}
        data-tip-pos="right"
        aria-label={item.prompt}
        aria-pressed={active}
      >
        <img src={item.thumbnailUrl} alt="" className={styles.iconThumb} loading="lazy" />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.item} ${active ? styles.itemActive : ""}`}
      onClick={select}
      aria-pressed={active}
    >
      <img src={item.thumbnailUrl} alt="" className={styles.thumb} loading="lazy" />
      <span className={styles.meta}>
        <span className={styles.time}>{relativeTime(item.createdAt)}</span>
        <span className={styles.prompt}>{item.prompt}</span>
      </span>
    </button>
  );
}

export function HistoryRail() {
  const { state, dispatch } = useStore();
  const collapsed = state.railCollapsed;

  const toggle = () => {
    const next = !collapsed;
    try {
      localStorage.setItem(RAIL_KEY, next ? "1" : "0");
    } catch {
      /* 私
有模式下忽略持久化失败 */
    }
    dispatch({ type: "rail", collapsed: next });
  };

  return (
    <aside className={`glass ${styles.rail} ${collapsed ? styles.railCollapsed : ""}`} aria-label="生成历史">
      <div className={styles.railHead}>
        {!collapsed && (
          <span className={styles.railTitle}>
            <ImageIcon size={14} aria-hidden />
            历史
          </span>
        )}
        <IconButton tip={collapsed ? "展开历史栏" : "收起历史栏"} tipPos={collapsed ? "right" : "top"} onClick={toggle}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </IconButton>
      </div>
      <div className={styles.list} role="listbox" aria-label="生成历史列表" aria-orientation="vertical">
        {state.history.length === 0 && !collapsed && <p className={styles.empty}>还没有生成记录</p>}
        {state.history.map((item) => (
          <ItemView key={item.jobId} item={item} active={item.jobId === state.activeJobId} collapsed={collapsed} />
        ))}
      </div>
    </aside>
  );
}
