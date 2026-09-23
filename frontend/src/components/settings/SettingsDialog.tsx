import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, FlaskConical, Plus, Star, Trash2 } from "lucide-react";
import {
  bridge,
  type Profile,
  type ProfileInput,
  type ProtocolKind,
  type RequestStrategy,
  type TestResult,
} from "../../lib/bridge";
import { useStore } from "../../state/store";
import { Badge, Button, ConfirmDialog, Dropdown, Field, IconButton, useModalLayer } from "../ui/kit";
import styles from "./SettingsDialog.module.css";

interface FormState {
  name: string;
  protocol: ProtocolKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  textModel: string;
  strategy: RequestStrategy;
  models: string[];
}

const EMPTY_FORM: FormState = {
  name: "",
  protocol: "images",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-image-1",
  textModel: "gpt-5.5",
  strategy: "openai",
  models: ["gpt-image-1"],
};

function toForm(p: Profile): FormState {
  return { name: p.name, protocol: p.protocol, baseUrl: p.baseUrl, apiKey: "", model: p.model, textModel: p.textModel ?? "gpt-5.5", strategy: p.strategy, models: p.models?.length ? p.models : [p.model] };
}

const TEST_COPY: Record<TestResult["conclusion"], { tone: "success" | "error" | "warn"; text: string }> = {
  ok: { tone: "success", text: "连接成功" },
  auth_failed: { tone: "error", text: "鉴权失败：请检查 API Key" },
  bad_url: { tone: "error", text: "地址错误：无法连接到该 Base URL" },
  model_unavailable: { tone: "warn", text: "模型不可用：请检查图像模型 ID" },
};

export function SettingsDialog() {
  const { state, dispatch, refreshProfiles, pushToast } = useStore();
  const open = state.settingsOpen;
  const close = useCallback(() => dispatch({ type: "settings", open: false }), [dispatch]);
  const layerRef = useModalLayer(open, close);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  const editingProfile = useMemo(
    () => (editingId && editingId !== "new" ? state.profiles.find((p) => p.id === editingId) ?? null : null),
    [editingId, state.profiles],
  );

  useEffect(() => {
    if (open && state.profiles.length > 0 && editingId === null) {
      const first = state.profiles.find((p) => p.isDefault) ?? state.profiles[0];
      setEditingId(first.id);
      setForm(toForm(first));
      setModelOptions(first.models?.length ? first.models : [first.model]);
      setTestResult(null);
      setFormError(null);
    }
    if (open && state.profiles.length === 0 && editingId === null) {
      startNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const startNew = () => {
    setEditingId("new");
    setForm(EMPTY_FORM);
    setFormError(null);
    setTestResult(null);
    setModelOptions([]);
  };

  const selectProfile = (p: Profile) => {
    setEditingId(p.id);
    setForm(toForm(p));
    setModelOptions(p.models?.length ? p.models : [p.model]);
    setFormError(null);
    setTestResult(null);
  };

  const patch = (partial: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...partial }));
    setTestResult(null);
  };

  const validate = (requireKey: boolean): string | null => {
    if (!form.name.trim()) return "请填写名称";
    if (!/^https?:\/\/.+/.test(form.baseUrl.trim())) return "Base URL 需以 http:// 或 https:// 开头";
    if (requireKey && !form.apiKey.trim()) return "请填写 API Key";
    if (!form.model.trim()) return "请填写默认图像模型 ID";
    if (!form.models.length) return "请至少选择一个图像模型";
    return null;
  };

  const validateConnection = (requireKey: boolean): string | null => {
    if (!form.name.trim()) return "请填写名称";
    if (!/^https?:\/\/.+/.test(form.baseUrl.trim())) return "Base URL 需以 http:// 或 https:// 开头";
    if (requireKey && !form.apiKey.trim()) return "请填写 API Key";
    return null;
  };

  const toInput = (): ProfileInput => ({
    name: form.name.trim(),
    protocol: form.protocol,
    baseUrl: form.baseUrl.trim(),
    apiKey: form.apiKey.trim() || undefined,
    model: form.model.trim(),
    textModel: form.textModel.trim(),
    strategy: form.strategy,
    models: form.models,
  });

  const fetchModels = async () => {
    const err = validateConnection(editingId === "new");
    if (err) { setFormError(err); return; }
    if (!bridge.fetchModels) { setFormError("当前环境不支持拉取模型列表"); return; }
    setFetchingModels(true); setFormError(null);
    try {
      const list = await bridge.fetchModels(editingId === "new" ? null : editingId, toInput());
      const selected = form.models.filter((model) => list.includes(model));
      setModelOptions(list);
      setForm((f) => ({ ...f, models: selected.length ? selected : list.slice(0, 1), model: selected[0] ?? list[0] ?? f.model }));
    } catch (e) { setFormError(e instanceof Error ? e.message : "拉取模型列表失败"); }
    finally { setFetchingModels(false); }
  };

  const toggleModel = (model: string) => {
    setForm((f) => {
      const models = f.models.includes(model) ? f.models.filter((item) => item !== model) : [...f.models, model];
      return { ...f, models, model: models.includes(f.model) ? f.model : models[0] ?? "" };
    });
  };

  const save = async () => {
    const err = validate(editingId === "new");
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId === "new" || editingId === null) {
        const created = await bridge.createProfile(toInput());
        await refreshProfiles();
        setEditingId(created.id);
        setForm((f) => ({ ...f, apiKey: "" }));
        pushToast("success", "已创建 Profile");
      } else {
        await bridge.updateProfile(editingId, toInput());
        await refreshProfiles();
        setForm((f) => ({ ...f, apiKey: "" }));
        pushToast("success", "已保存修改");
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    const err = validate(editingId === "new");
    if (err) {
      setFormError(err);
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await bridge.testProfile(toInput());
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const setDefault = async (id: string) => {
    await bridge.setDefaultProfile(id);
    await refreshProfiles();
    pushToast("success", "已设为默认 Profile");
  };

  const doDelete = async () => {
    if (!confirmDeleteId) return;
    await bridge.deleteProfile(confirmDeleteId);
    setConfirmDeleteId(null);
    await refreshProfiles();
    pushToast("success", "已删除 Profile");
    if (editingId === confirmDeleteId) {
      setEditingId(null);
      setForm(EMPTY_FORM);
    }
  };

  const maskedHint = editingProfile?.hasKey ? `已保存 ${editingProfile.apiKeyMasked}，留空表示不修改` : undefined;

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={layerRef} role="dialog" aria-modal="true" aria-label="设置" className={`glass-strong ${styles.dialog}`} tabIndex={-1}>
        <div className={styles.dialogHead}>
          <h2 className={styles.dialogTitle}>设置</h2>
          <Button variant="ghost" onClick={close}>
            完成
          </Button>
        </div>

        <div className={styles.columns}>
          <nav className={styles.listCol} aria-label="Profile 列表">
            <div className={styles.listHead}>
              <span className={styles.listTitle}>Profiles</span>
              <IconButton tip="新建 Profile" onClick={startNew}>
                <Plus size={15} />
              </IconButton>
            </div>
            <div className={styles.list}>
              {state.profiles.map((p) => (
                <div key={p.id} className={`${styles.listItem} ${p.id === editingId ? styles.listItemActive : ""}`}>
                  <button type="button" className={styles.listItemMain} onClick={() => selectProfile(p)} aria-pressed={p.id === editingId}>
                    <span className={styles.listItemName}>
                      {p.name}
                      {p.isDefault && (
                        <span className={styles.defaultMark} aria-label="默认">
                          <Star size={11} fill="currentColor" />
                        </span>
                      )}
                    </span>
                    <span className={styles.listItemSub}>
                      {p.model} · {p.apiKeyMasked || "未配置 Key"}
                    </span>
                  </button>
                  <div className={styles.listItemActions}>
                    {!p.isDefault && (
                      <IconButton tip="设为默认" onClick={() => void setDefault(p.id)}>
                        <Star size={13} />
                      </IconButton>
                    )}
                    <IconButton tip="删除" className={styles.deleteBtn} onClick={() => setConfirmDeleteId(p.id)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              ))}
              {state.profiles.length === 0 && <p className={styles.listEmpty}>还没有 Profile</p>}
            </div>
          </nav>

          <div className={styles.formCol}>
            <div className={styles.form}>
              <Field label="名称" htmlFor="pf-name">
                <input id="pf-name" className={styles.input} value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder="例如：OpenAI 官方 / 中转站 A" />
              </Field>

              <div className={styles.formRow}>
                <Field label="协议类型" htmlFor="pf-protocol">
                  <Dropdown
                    id="pf-protocol"
                    label="协议类型"
                    value={form.protocol}
                    options={[{ value: "images", label: "Images API" }, { value: "responses", label: "Responses API" }]}
                    onChange={(protocol) => patch({ protocol: protocol as ProtocolKind })}
                  />
                </Field>
                <Field label="请求策略" htmlFor="pf-strategy">
                  <Dropdown
                    id="pf-strategy"
                    label="请求策略"
                    value={form.strategy}
                    options={[{ value: "openai", label: "OpenAI 标准" }, { value: "compatible", label: "兼容模式" }]}
                    onChange={(strategy) => patch({ strategy: strategy as RequestStrategy })}
                  />
                </Field>
              </div>

              <Field label="Base URL" htmlFor="pf-baseurl">
                <input id="pf-baseurl" className={styles.input} value={form.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" spellCheck={false} />
              </Field>

              <Field label={editingId === "new" ? "API Key" : "API Key（留空则不修改）"} htmlFor="pf-key">
                <input
                  id="pf-key"
                  className={styles.input}
                  type="password"
                  autoComplete="off"
                  value={form.apiKey}
                  onChange={(e) => patch({ apiKey: e.target.value })}
                  placeholder={maskedHint ?? "sk-…"}
                  spellCheck={false}
                />
              </Field>

              <Field label="默认模型（拉取后可选择）" htmlFor="pf-model">
                <input id="pf-model" className={styles.input} value={form.model} onChange={(e) => { const model = e.target.value; setForm((f) => ({ ...f, model, models: model.trim() && !f.models.includes(model.trim()) ? [model.trim(), ...f.models] : f.models })); setTestResult(null); }} placeholder="先拉取列表，或手动填写模型 ID" spellCheck={false} />
              </Field>

              {form.protocol === "responses" && (
                <Field label="Responses 文本模型" htmlFor="pf-text-model">
                  <input id="pf-text-model" className={styles.input} value={form.textModel} onChange={(e) => patch({ textModel: e.target.value })} placeholder="例如：gpt-5.5" spellCheck={false} />
                </Field>
              )}

              <div className={styles.modelHeader}>
                <span className={styles.modelLabel}>可用模型（可多选）</span>
                <Button variant="ghost" onClick={() => void fetchModels()} disabled={fetchingModels}>
                  <Download size={14} aria-hidden />
                  {fetchingModels ? "拉取中…" : "拉取模型列表"}
                </Button>
              </div>
              {modelOptions.length > 0 ? (
                <div className={styles.modelList} aria-label="可用模型列表">
                  {modelOptions.map((model) => (
                    <label key={model} className={styles.modelOption}>
                      <input type="checkbox" checked={form.models.includes(model)} onChange={() => toggleModel(model)} />
                      <span>{model}</span>
                      {model === form.model && <Badge tone="neutral">默认</Badge>}
                    </label>
                  ))}
                </div>
              ) : (
                <p className={styles.modelHint}>无需填写模型 ID 即可拉取；拉取完成后选择允许用于生图的模型。</p>
              )}

              {formError && (
                <p className={styles.formError} role="alert">
                  {formError}
                </p>
              )}

              <div className={styles.formActions}>
                <Button variant="ghost" onClick={() => void testConnection()} disabled={testing}>
                  <FlaskConical size={14} aria-hidden />
                  {testing ? "测试中…" : "测试连接"}
                </Button>
                {testResult && (
                  <Badge tone={TEST_COPY[testResult.conclusion].tone}>
                    {testResult.conclusion === "ok" && <Check size={11} aria-hidden />}
                    {TEST_COPY[testResult.conclusion].text}
                    {testResult.conclusion === "ok" && testResult.latencyMs ? ` · ${testResult.latencyMs}ms` : ""}
                  </Badge>
                )}
                <span className={styles.actionSpacer} />
                <Button variant="primary" onClick={() => void save()} disabled={saving}>
                  {saving ? "保存中…" : editingId === "new" ? "创建" : "保存"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="删除这个 Profile？"
        body="将删除该 Profile 的配置信息。已生成的历史图片不受影响。"
        confirmText="删除"
        danger
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
