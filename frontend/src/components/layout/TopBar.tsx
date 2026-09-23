import { Settings } from "lucide-react";
import { useStore } from "../../state/store";
import { Dropdown, IconButton } from "../ui/kit";
import styles from "./TopBar.module.css";

export function TopBar() {
  const { state, activeProfile, dispatch } = useStore();

  return (
    <header className={`glass ${styles.bar}`}>
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden />
        <span className={styles.name}>API Canvas</span>
      </div>

      <div className={styles.right}>
        <div className={styles.profileWrap}>
          <label className={styles.profileLabel} htmlFor="profile-picker">
            Profile
          </label>
          <Dropdown
            id="profile-picker"
            label="选择 Profile"
            value={activeProfile?.id ?? ""}
            options={state.profiles.length === 0 ? [{ value: "", label: "未配置" }] : state.profiles.map((p) => ({ value: p.id, label: `${p.name}${p.isDefault ? " · 默认" : ""}` }))}
            onChange={(id) => dispatch({ type: "select-profile", id: id || null })}
            disabled={state.profiles.length === 0}
            className={styles.profileSelect}
            containerClassName={styles.profileDropdown}
          />
        </div>
        <IconButton tip="设置" onClick={() => dispatch({ type: "settings", open: true })}>
          <Settings size={17} />
        </IconButton>
      </div>
    </header>
  );
}
