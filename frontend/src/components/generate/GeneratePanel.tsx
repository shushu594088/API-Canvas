import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Loader2, Square, Wand2 } from "lucide-react";
import { bridge } from "../../lib/bridge";
import { coerceParams, defaultParams, paramOptions, sizeChoices } from "../../lib/params";
import { useStore } from "../../state/store";
import { Button, Dropdown, Field } from "../ui/kit";
import styles from "./GeneratePanel.module.css";

const QUALITY_LABELS: Record<string, string> = { auto: "自动", low: "低", medium: "中", high: "高", standard: "标准", hd: "HD" };

export function GeneratePanel() {
  const { state, activeProfile, dispatch, pushToast } = useStore();
  const [model, setModel] = useState(activeProfile?.model ?? "");
  const [params, setParams] = useState(() => defaultParams(activeProfile?.model ?? "gpt-image-1"));
  const [models, setModels] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [selectedRatio, setSelectedRatio] = useState<string | null>(null);
  const sizeMenuRef = useRef<HTMLDivElement>(null);

  const prompt = state.draftPrompt;
  const negativePrompt = state.draftNegativePrompt;
  const running = state.jobs.some((j) => j.status === "running" || j.status === "queued");
  const activeProfileId = activeProfile?.id ?? null;
  const supportsNegativePrompt = activeProfile?.protocol === "images" && activeProfile.strategy === "compatible";

  useEffect(() => {
    if (!activeProfile) {
      setModels([]);
      setModel("");
      return;
    }
    setModel((m) => (m ? m : activeProfile.model));
    let cancelled = false;
    const available = activeProfile.models?.length ? Promise.resolve(activeProfile.models) : bridge.listAvailableModels(activeProfile.protocol, activeProfile.strategy);
    void available.then((list) => {
      if (cancelled) return;
      const merged = list.includes(activeProfile.model) ? list : [activeProfile.model, ...list];
      setModels(merged);
    });
  }, [activeProfile]);

  // 模型切换：不合法参数收敛到新模型的合法集合
  const onModelChange = (next: string) => {
    setModel(next);
    setParams((p) => coerceParams(next, p));
  };

  // 提示词框自动增高：96px ~ 200px
  const autosize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(200, Math.max(96, el.scrollHeight))}px`;
  };
  useEffect(autosize, [prompt]);

  useEffect(() => {
    if (!sizeMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!sizeMenuRef.current?.contains(event.target as Node)) {
        setSizeMenuOpen(false);
        setSelectedRatio(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSizeMenuOpen(false);
        setSelectedRatio(null);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sizeMenuOpen]);

  const canGenerate = prompt.trim().length > 0 && !!activeProfileId && !!model && !running;

  const submit = async () => {
    if (!canGenerate || !activeProfileId) return;
    try {
      await bridge.startGeneration({
        prompt: prompt.trim(),
        negativePrompt: supportsNegativePrompt ? negativePrompt.trim() : "",
        model,
        size: params.size,
        quality: params.quality,
        format: params.format,
        profileId: activeProfileId,
      });
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : "启动生成失败");
    }
  };

  const cancelActive = async () => {
    const job = state.jobs.find((j) => j.status === "running" || j.status === "queued");
    if (job) await bridge.cancelGeneration(job.id);
  };

  const opts = paramOptions(model || "gpt-image-1");

  return (
    <aside className={`glass ${styles.panel}`} aria-label="生成面板">
      <div className={styles.head}>
        <span className={styles.title}>生成</span>
      </div>

      <div className={styles.body}>
        <Field label="提示词" htmlFor="prompt-input">
          <textarea
            id="prompt-input"
            ref={taRef}
            className={styles.textarea}
            placeholder="描述你想要的画面…"
            value={prompt}
            onChange={(e) => dispatch({ type: "draft", text: e.target.value })}
            rows={4}
            aria-label="提示词"
          />
        </Field>

        <Field label="反向提示词（可选）" htmlFor="negative-prompt-input">
          <textarea
            id="negative-prompt-input"
            className={`${styles.textarea} ${!supportsNegativePrompt ? styles.unsupported : ""}`}
            placeholder={supportsNegativePrompt ? "描述不希望出现在画面中的内容…" : "当前 API 格式不支持反向提示词"}
            value={negativePrompt}
            onChange={(e) => dispatch({ type: "negative-draft", text: e.target.value })}
            onClick={() => {
              if (!supportsNegativePrompt) pushToast("info", "当前 API 格式不支持反向提示词，请切换到 Images API 兼容模式");
            }}
            readOnly={!supportsNegativePrompt}
            aria-label="反向提示词"
            aria-disabled={!supportsNegativePrompt}
            rows={3}
          />
        </Field>

        <Field label="模型" htmlFor="model-select">
          <Dropdown
            id="model-select"
            label="模型"
            value={model}
            options={(models.length === 0 ? [{ value: model, label: activeProfileId ? model || activeProfile?.model || "未配置 Profile" : "未配置 Profile" }] : models.map((m) => ({ value: m, label: m })))}
            onChange={onModelChange}
            disabled={!activeProfileId}
          />
        </Field>
        <div className={styles.row}>
          <Field label="尺寸 / 比例" htmlFor="size-select-trigger">
            <div className={styles.sizePicker} ref={sizeMenuRef}>
              <button
                id="size-select-trigger"
                type="button"
                className={`${styles.select} ${styles.sizeTrigger}`}
                aria-label="尺寸"
                aria-haspopup="listbox"
                aria-expanded={sizeMenuOpen}
                onClick={() => {
                  setSizeMenuOpen((open) => !open);
                  setSelectedRatio(null);
                }}
              >
                <span>{params.size === "auto" ? "自动" : params.size.replace("x", " × ")}</span>
                <ChevronDown size={15} aria-hidden />
              </button>
              {sizeMenuOpen && (
                <div className={styles.sizeMenu} role="listbox" aria-label="选择尺寸">
                  {selectedRatio ? (
                    <>
                      <button type="button" className={styles.sizeMenuBack} onClick={() => setSelectedRatio(null)}>
                        <ChevronLeft size={15} aria-hidden />
                        <span>{selectedRatio} 比例</span>
                      </button>
                      {sizeChoices(opts.sizes).filter((choice) => choice.ratio === selectedRatio).map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          role="option"
                          aria-selected={params.size === choice.value}
                          className={styles.sizeOption}
                          onClick={() => {
                            setParams({ ...params, size: choice.value });
                            setSizeMenuOpen(false);
                            setSelectedRatio(null);
                          }}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      {opts.sizes.includes("auto") && (
                        <button
                          type="button"
                          role="option"
                          aria-selected={params.size === "auto"}
                          className={styles.sizeOption}
                          onClick={() => {
                            setParams({ ...params, size: "auto" });
                            setSizeMenuOpen(false);
                          }}
                        >
                          自动
                        </button>
                      )}
                      {[...new Set(sizeChoices(opts.sizes).map((choice) => choice.ratio).filter((ratio) => ratio !== "auto"))].map((ratio) => {
                        const [width, height] = ratio.split(":").map(Number);
                        return (
                          <button key={ratio} type="button" className={styles.ratioOption} onClick={() => setSelectedRatio(ratio)}>
                            <span className={styles.ratioFrame} style={{ aspectRatio: `${width} / ${height}` }} aria-hidden="true" />
                            <span>{ratio}</span>
                            <ChevronDown size={14} aria-hidden />
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </Field>
          <Field label="质量" htmlFor="quality-select">
            <Dropdown
              id="quality-select"
              label="质量"
              value={params.quality}
              options={opts.qualities.map((q) => ({ value: q, label: QUALITY_LABELS[q] ?? q }))}
              onChange={(quality) => setParams({ ...params, quality })}
            />
          </Field>
        </div>

        <Field label="输出格式" htmlFor="format-select">
          <Dropdown
            id="format-select"
            label="输出格式"
            value={params.format}
            options={opts.formats.map((f) => ({ value: f, label: f.toUpperCase() }))}
            onChange={(format) => setParams({ ...params, format })}
            disabled={opts.formats.length === 1}
          />
        </Field>
      </div>

      <div className={styles.foot}>
        {running ? (
          <Button variant="danger" className={styles.cta} onClick={cancelActive}>
            <Square size={14} aria-hidden />
            停止生成
          </Button>
        ) : (
          <Button variant="primary" className={styles.cta} disabled={!canGenerate} onClick={submit} aria-disabled={!canGenerate}>
            {state.jobs.some((j) => j.status === "queued") ? (
              <Loader2 size={15} aria-hidden className={styles.spin} />
            ) : (
              <Wand2 size={15} aria-hidden />
            )}
            生成
          </Button>
        )}
        {!activeProfileId && <p className={styles.hint}>请先在设置中添加 Profile</p>}
      </div>
    </aside>
  );
}


