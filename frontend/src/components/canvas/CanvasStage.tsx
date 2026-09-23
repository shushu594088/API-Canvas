import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  FolderOpen,
  ImageOff,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { bridge, type ErrorCode } from "../../lib/bridge";
import { errorCopy } from "../../lib/errors";
import { useStore } from "../../state/store";
import { Button, ConfirmDialog, IconButton, Spinner } from "../ui/kit";
import styles from "./CanvasStage.module.css";

const EXAMPLE_PROMPTS = [
  "清晨山谷中的云海，远景构图，柔和自然光",
  "一只穿宇航服的橘猫，复古海报风格",
  "未来感图书馆内部，玻璃与木质结构，电影感打光",
];

interface DisplayTarget {
  jobId: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  size: string;
  quality: string;
  format: string;
  status: "running" | "queued" | "succeeded" | "failed" | "canceled";
  progress: number;
  errorCode?: ErrorCode;
  errorMessage?: string;
  imageUrl?: string;
  assetId?: string;
}

function useTarget(): DisplayTarget | null {
  const { state } = useStore();
  return useMemo(() => {
    const job = state.jobs.find((j) => j.id === state.activeJobId);
    if (job) {
      const asset = state.assets.find((a) => a.jobId === job.id);
      return {
        jobId: job.id,
        prompt: job.prompt,
        negativePrompt: job.negativePrompt,
        model: job.model,
        size: job.size,
        quality: job.quality,
        format: job.format,
        status: job.status,
        progress: job.progress,
        errorCode: job.errorCode,
        errorMessage: job.errorMessage,
        imageUrl: asset?.displayUrl,
        assetId: asset?.id,
      };
    }
    const item = state.history.find((h) => h.jobId === state.activeJobId);
    if (item) {
      return {
        jobId: item.jobId,
        prompt: item.prompt,
        negativePrompt: item.negativePrompt,
        model: item.model,
        size: item.size,
        quality: item.quality,
        format: item.format,
        status: "succeeded",
        progress: 1,
        imageUrl: item.thumbnailUrl,
        assetId: item.assetId,
      };
    }
    return null;
  }, [state.jobs, state.assets, state.history, state.activeJobId]);
}

function RunningView({ target }: { target: DisplayTarget }) {
  const { pushToast } = useStore();
  const pct = Math.round(target.progress * 100);
  const cancel = async () => {
    await bridge.cancelGeneration(target.jobId);
    pushToast("info", "已取消本次生成");
  };
  return (
    <div className={styles.stageCenter}>
      <div className={styles.imageZone}>
        {target.imageUrl && <img src={target.imageUrl} alt="" className={`${styles.image} ${styles.imageDim}`} />}
        <div className={`glass-strong ${styles.progressCard}`} role="status" aria-live="polite">
          <Spinner label="生成中" />
          <div className={styles.progressTexts}>
            <span className={styles.progressTitle}>正在生成</span>
            <span className={styles.progressSub}>{target.model} · {target.size}</span>
          </div>
          <div className={styles.progressTrack} aria-hidden>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
          </div>
          <span className={styles.progressPct}>{pct}%</span>
          <Button variant="ghost" onClick={cancel}>
            <X size={14} aria-hidden />
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}

function SuccessView({ target }: { target: DisplayTarget }) {
  const { dispatch, pushToast } = useStore();
  const [imgError, setImgError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(target.prompt);
      pushToast("success", "提示词已复制");
    } catch {
      pushToast("error", "复制失败，请手动选择复制");
    }
  };

  const save = async () => {
    if (!target.assetId) return;
    try {
      const path = await bridge.saveImage(target.assetId);
      setSaveFailed(false);
      pushToast("success", `已保存：${path}`);
    } catch {
      setSaveFailed(true);
    }
  };

  const openFile = async () => {
    if (!target.assetId) return;
    try {
      await bridge.openImage(target.assetId);
    } catch {
      pushToast("error", "打开文件失败");
    }
  };

  const regenerate = () => {
    dispatch({ type: "draft", text: target.prompt });
    dispatch({ type: "negative-draft", text: target.negativePrompt ?? "" });
    pushToast("info", "提示词已填入生成面板");
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    await bridge.deleteHistory(target.jobId);
    dispatch({ type: "history-remove", jobId: target.jobId });
    pushToast("success", "已删除该条历史与本地图片");
  };

  return (
    <div className={styles.stageCenter}>
      {saveFailed && (
        <div className={`glass ${styles.banner}`} role="alert">
          <span className={styles.bannerText}>结果保存失败：图片未能写入本地。</span>
          <Button variant="ghost" onClick={save}>
            重试保存
          </Button>
          <IconButton tip="关闭" onClick={() => setSaveFailed(false)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      <div className={styles.imageZone}>
        {imgError ? (
          <div className={`glass ${styles.brokenPane}`} role="alert">
            <ImageOff size={36} aria-hidden />
            <p className={styles.brokenTitle}>图片加载失败</p>
            <p className={styles.brokenSub}>本地文件可能已被移动或删除。</p>
            <Button variant="subtle" onClick={() => setImgError(false)}>
              <RefreshCw size={14} aria-hidden />
              重试加载
            </Button>
          </div>
        ) : (
          target.imageUrl && (
            <img
              src={target.imageUrl}
              alt={target.prompt}
              className={styles.image}
              onError={() => setImgError(true)}
            />
          )
        )}
      </div>
      <div className={`glass ${styles.toolbar}`}>
        <IconButton tip="复制提示词" onClick={copyPrompt}>
          <Copy size={16} />
        </IconButton>
        <IconButton tip="保存到本地" onClick={save}>
          <Download size={16} />
        </IconButton>
        <IconButton tip="打开文件" onClick={openFile}>
          <FolderOpen size={16} />
        </IconButton>
        <IconButton tip="重新生成" onClick={regenerate}>
          <RefreshCw size={16} />
        </IconButton>
        <span className={styles.toolbarDivider} aria-hidden />
        <IconButton tip="删除历史" className={styles.dangerIcon} onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} />
        </IconButton>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="删除这条历史？"
        body="将同时删除该记录对应的本地图片文件，此操作不可撤销。"
        confirmText="删除"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function FailedView({ target }: { target: DisplayTarget }) {
  const { dispatch, pushToast } = useStore();
  const copy = errorCopy(target.errorCode ?? "upstream_error");
  const retry = () => {
    dispatch({ type: "draft", text: target.prompt });
    dispatch({ type: "negative-draft", text: target.negativePrompt ?? "" });
    pushToast("info", "提示词已填入生成面板，可调整后重新生成");
  };
  return (
    <div className={styles.stageCenter}>
      <div className={`glass ${styles.noticePane}`} role="alert">
        <span className={styles.noticeIconError} aria-hidden>
          <X size={18} />
        </span>
        <p className={styles.noticeTitle}>{copy.title}</p>
        <p className={styles.noticeSub}>{copy.hint}</p>
        {target.errorMessage && <p className={styles.noticeSub}>{target.errorMessage}</p>}
        <div className={styles.noticeActions}>
          <Button variant="subtle" onClick={retry}>
            重试
          </Button>
          <Button variant="ghost" onClick={() => dispatch({ type: "settings", open: true })}>
            检查设置
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CanvasStage() {
  const { state, dispatch } = useStore();
  const target = useTarget();

  // 1) 未配置上游
  if (state.ready && state.profiles.length === 0) {
    return (
      <main className={styles.stage} aria-label="主画布">
        <div className={styles.stageCenter}>
          <div className={`glass ${styles.noticePane}`}>
            <span className={styles.noticeIcon} aria-hidden>
              <Settings2 size={18} />
            </span>
            <p className={styles.noticeTitle}>先配置一个上游</p>
            <p className={styles.noticeSub}>连接 OpenAI 或兼容的中转服务后即可开始生图。</p>
            <Button variant="primary" onClick={() => dispatch({ type: "settings", open: true })}>
              打开设置
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // 2) 已就绪空状态
  if (!target) {
    return (
      <main className={styles.stage} aria-label="主画布">
        <div className={styles.stageCenter}>
          <div className={styles.hero}>
            <span className={styles.heroIcon} aria-hidden>
              <Sparkles size={22} />
            </span>
            <p className={styles.heroText}>在右侧输入提示词，开始你的第一张图。</p>
            <div className={styles.chipRow}>
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`glass ${styles.chip}`}
                  onClick={() => dispatch({ type: "draft", text: p })}
                >
                  <Wand2 size={13} aria-hidden />
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.stage} aria-label="主画布">
      {target.status === "running" || target.status === "queued" ? (
        <RunningView target={target} />
      ) : target.status === "failed" || target.status === "canceled" ? (
        target.status === "canceled" ? (
          <div className={styles.stageCenter}>
            <div className={`glass ${styles.noticePane}`}>
              <span className={styles.noticeIcon} aria-hidden>
                <X size={18} />
              </span>
              <p className={styles.noticeTitle}>已取消</p>
              <p className={styles.noticeSub}>本次生成被取消，提示词仍在右侧面板中。</p>
            </div>
          </div>
        ) : (
          <FailedView target={target} />
        )
      ) : (
        <SuccessView target={target} />
      )}
    </main>
  );
}

