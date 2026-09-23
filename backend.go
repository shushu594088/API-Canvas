package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Profile struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Protocol     string   `json:"protocol"`
	BaseURL      string   `json:"baseUrl"`
	APIKeyMasked string   `json:"apiKeyMasked"`
	HasKey       bool     `json:"hasKey"`
	Model        string   `json:"model"`
	TextModel    string   `json:"textModel,omitempty"`
	Models       []string `json:"models,omitempty"`
	Strategy     string   `json:"strategy"`
	IsDefault    bool     `json:"isDefault"`
	CreatedAt    int64    `json:"createdAt"`
	UpdatedAt    int64    `json:"updatedAt"`
}
type profileRecord struct {
	Profile
	APIKey string `json:"-"`
}
type ProfileInput struct {
	Name      string   `json:"name"`
	Protocol  string   `json:"protocol"`
	BaseURL   string   `json:"baseUrl"`
	APIKey    string   `json:"apiKey"`
	Model     string   `json:"model"`
	TextModel string   `json:"textModel,omitempty"`
	Models    []string `json:"models,omitempty"`
	Strategy  string   `json:"strategy"`
}
type TestResult struct {
	Conclusion string `json:"conclusion"`
	LatencyMs  int64  `json:"latencyMs,omitempty"`
}
type GenerationRequest struct {
	Prompt         string `json:"prompt"`
	NegativePrompt string `json:"negativePrompt,omitempty"`
	Model          string `json:"model"`
	Size           string `json:"size"`
	Quality        string `json:"quality"`
	Format         string `json:"format"`
	ProfileID      string `json:"profileId"`
}
type GenerationJob struct {
	ID             string  `json:"id"`
	ProfileID      string  `json:"profileId"`
	Prompt         string  `json:"prompt"`
	NegativePrompt string  `json:"negativePrompt,omitempty"`
	Model          string  `json:"model"`
	Size           string  `json:"size"`
	Quality        string  `json:"quality"`
	Format         string  `json:"format"`
	Status         string  `json:"status"`
	Progress       float64 `json:"progress"`
	ErrorCode      string  `json:"errorCode,omitempty"`
	ErrorMessage   string  `json:"errorMessage,omitempty"`
	CreatedAt      int64   `json:"createdAt"`
}
type ImageAsset struct {
	ID         string `json:"id"`
	JobID      string `json:"jobId"`
	DisplayURL string `json:"displayUrl"`
	FilePath   string `json:"filePath"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
}
type HistoryItem struct {
	JobID          string `json:"jobId"`
	Prompt         string `json:"prompt"`
	NegativePrompt string `json:"negativePrompt,omitempty"`
	Model          string `json:"model"`
	Size           string `json:"size"`
	Quality        string `json:"quality"`
	Format         string `json:"format"`
	CreatedAt      int64  `json:"createdAt"`
	ThumbnailURL   string `json:"thumbnailUrl"`
	AssetID        string `json:"assetId"`
}
type HistoryQuery struct {
	Cursor string `json:"cursor"`
	Limit  int    `json:"limit"`
}
type HistoryPage struct {
	Items      []HistoryItem `json:"items"`
	NextCursor string        `json:"nextCursor,omitempty"`
}
type storedState struct {
	Profiles []profileRecord `json:"profiles"`
	Jobs     []GenerationJob `json:"jobs"`
	Assets   []ImageAsset    `json:"assets"`
}

type App struct {
	ctx     context.Context
	mu      sync.Mutex
	state   storedState
	dataDir string
	running map[string]context.CancelFunc
}

const (
	defaultResponsesTextModel = "gpt-5.5"
	requestTimeout            = 5 * time.Minute
	requestMaxAttempts        = 3
	requestRetryDelay         = 250 * time.Millisecond
)

func NewApp() *App { return &App{running: map[string]context.CancelFunc{}} }
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.dataDir = appDataDir()
	_ = os.MkdirAll(filepath.Join(a.dataDir, "images"), 0o700)
	a.load()
}
func appDataDir() string {
	root, err := os.UserConfigDir()
	if err != nil {
		root = os.TempDir()
	}
	current := filepath.Join(root, "API Canvas")
	migrateLegacyAppData(filepath.Join(root, "Image Studio"), current)
	return current
}

func migrateLegacyAppData(legacy, current string) {
	if legacy == current {
		return
	}
	if _, err := os.Stat(filepath.Join(current, "state.json")); err == nil {
		return
	}
	if _, err := os.Stat(legacy); err != nil {
		return
	}
	if err := os.MkdirAll(current, 0o700); err != nil {
		return
	}
	for _, name := range []string{"state.json", "keys.json"} {
		copyFileIfMissing(filepath.Join(legacy, name), filepath.Join(current, name))
	}
	copyDirIfMissing(filepath.Join(legacy, "images"), filepath.Join(current, "images"))
}

func copyFileIfMissing(source, target string) {
	if _, err := os.Stat(target); err == nil {
		return
	}
	input, err := os.Open(source)
	if err != nil {
		return
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return
	}
	defer output.Close()
	_, _ = io.Copy(output, input)
}

func copyDirIfMissing(source, target string) {
	entries, err := os.ReadDir(source)
	if err != nil {
		return
	}
	if err := os.MkdirAll(target, 0o700); err != nil {
		return
	}
	for _, entry := range entries {
		sourcePath := filepath.Join(source, entry.Name())
		targetPath := filepath.Join(target, entry.Name())
		if entry.IsDir() {
			copyDirIfMissing(sourcePath, targetPath)
		} else {
			copyFileIfMissing(sourcePath, targetPath)
		}
	}
}
func (a *App) statePath() string { return filepath.Join(a.dataDir, "state.json") }
func (a *App) keyPath() string   { return filepath.Join(a.dataDir, "keys.json") }
func (a *App) load() {
	b, err := os.ReadFile(a.statePath())
	if err == nil {
		_ = json.Unmarshal(b, &a.state)
	}
	legacyImages := filepath.Join(filepath.Dir(a.dataDir), "Image Studio", "images")
	currentImages := filepath.Join(a.dataDir, "images")
	updated := false
	for i := range a.state.Assets {
		path := a.state.Assets[i].FilePath
		rel, err := filepath.Rel(legacyImages, path)
		if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		replacement := filepath.Join(currentImages, rel)
		if _, err := os.Stat(replacement); err == nil {
			a.state.Assets[i].FilePath = replacement
			updated = true
		}
	}
	if updated {
		_ = a.saveLocked()
	}
	if keys, err := loadProtectedKeys(a.keyPath()); err == nil {
		for i := range a.state.Profiles {
			a.state.Profiles[i].APIKey = keys[a.state.Profiles[i].ID]
		}
	}
	for i := range a.state.Profiles {
		a.state.Profiles[i].TextModel = normalizeTextModel(a.state.Profiles[i].TextModel)
		a.state.Profiles[i].Profile.APIKeyMasked = maskKey(a.state.Profiles[i].APIKey)
		a.state.Profiles[i].Profile.HasKey = a.state.Profiles[i].APIKey != ""
	}
}
func (a *App) saveKeysLocked() error {
	keys := make(map[string]string, len(a.state.Profiles))
	for _, p := range a.state.Profiles {
		if p.APIKey != "" {
			keys[p.ID] = p.APIKey
		}
	}
	return saveProtectedKeys(a.keyPath(), keys)
}
func (a *App) saveLocked() error {
	b, err := json.MarshalIndent(a.state, "", "  ")
	if err != nil {
		return err
	}
	tmp := a.statePath() + ".tmp"
	if err = os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, a.statePath())
}
func newID(prefix string) string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("%s-%x", prefix, b)
}
func maskKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return ""
	}
	if len(key) <= 4 {
		return "sk-••••"
	}
	return "sk-••••" + key[len(key)-4:]
}
func normalizeBase(s string) string { return strings.TrimRight(strings.TrimSpace(s), "/") }

func localFileURL(path string) string {
	path = filepath.ToSlash(path)
	if len(path) >= 2 && path[1] == ':' && !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return (&url.URL{Scheme: "file", Path: path}).String()
}

func imageDataURL(mime string, data []byte) string {
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func apiBase(s string) string {
	base := normalizeBase(s)
	u, err := url.Parse(base)
	if err == nil && strings.Trim(u.Path, "/") == "" {
		return base + "/v1"
	}
	return base
}

func apiEndpoint(base, path string) string {
	return apiBase(base) + "/" + strings.Trim(path, "/")
}

func validateInput(in ProfileInput) error {
	if strings.TrimSpace(in.Name) == "" {
		return errors.New("请填写 Profile 名称")
	}
	u, err := url.Parse(normalizeBase(in.BaseURL))
	if err != nil || u.Scheme == "" || u.Host == "" || u.User != nil {
		return errors.New("Base URL 无效")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("Base URL 仅支持 http:// 或 https://")
	}
	if u.Scheme == "http" && !isLoopbackHost(u.Hostname()) {
		return errors.New("拒绝使用非 TLS 上游；远程地址必须使用 https://，只有本机地址允许 http://")
	}
	if strings.TrimSpace(in.Model) == "" {
		return errors.New("请填写图像模型 ID")
	}
	if in.Protocol != "images" && in.Protocol != "responses" {
		return errors.New("协议类型无效")
	}
	return nil
}

func isLoopbackHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
func publicProfile(p profileRecord) Profile {
	p.Profile.APIKeyMasked = maskKey(p.APIKey)
	p.Profile.HasKey = p.APIKey != ""
	p.APIKey = ""
	return p.Profile
}

func (a *App) ListProfiles() []Profile {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := make([]Profile, 0, len(a.state.Profiles))
	for _, p := range a.state.Profiles {
		out = append(out, publicProfile(p))
	}
	return out
}
func (a *App) CreateProfile(in ProfileInput) (Profile, error) { return a.saveProfile("", in) }
func (a *App) UpdateProfile(id string, in ProfileInput) (Profile, error) {
	return a.saveProfile(id, in)
}
func (a *App) saveProfile(id string, in ProfileInput) (Profile, error) {
	if err := validateInput(in); err != nil {
		return Profile{}, err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	now := time.Now().UnixMilli()
	if id == "" {
		id = newID("p")
		models := cleanModels(in.Models, in.Model)
		p := profileRecord{Profile: Profile{ID: id, Name: strings.TrimSpace(in.Name), Protocol: in.Protocol, BaseURL: normalizeBase(in.BaseURL), Model: strings.TrimSpace(in.Model), TextModel: normalizeTextModel(in.TextModel), Models: models, Strategy: in.Strategy, IsDefault: len(a.state.Profiles) == 0, CreatedAt: now, UpdatedAt: now}, APIKey: strings.TrimSpace(in.APIKey)}
		a.state.Profiles = append(a.state.Profiles, p)
		if err := a.saveLocked(); err != nil {
			return Profile{}, err
		}
		if err := a.saveKeysLocked(); err != nil {
			return Profile{}, err
		}
		return publicProfile(p), nil
	}
	for i := range a.state.Profiles {
		if a.state.Profiles[i].ID == id {
			p := &a.state.Profiles[i]
			p.Name = strings.TrimSpace(in.Name)
			p.Protocol = in.Protocol
			p.BaseURL = normalizeBase(in.BaseURL)
			p.Model = strings.TrimSpace(in.Model)
			p.TextModel = normalizeTextModel(in.TextModel)
			p.Models = cleanModels(in.Models, in.Model)
			p.Strategy = in.Strategy
			p.UpdatedAt = now
			if strings.TrimSpace(in.APIKey) != "" {
				p.APIKey = strings.TrimSpace(in.APIKey)
			}
			if err := a.saveLocked(); err != nil {
				return Profile{}, err
			}
			if err := a.saveKeysLocked(); err != nil {
				return Profile{}, err
			}
			return publicProfile(*p), nil
		}
	}
	return Profile{}, errors.New("Profile 不存在")
}

func normalizeTextModel(model string) string {
	model = strings.TrimSpace(model)
	if model == "" {
		return defaultResponsesTextModel
	}
	return model
}
func cleanModels(models []string, fallback string) []string {
	out := make([]string, 0, len(models)+1)
	seen := map[string]bool{}
	for _, model := range models {
		model = strings.TrimSpace(model)
		if model != "" && !seen[model] {
			seen[model] = true
			out = append(out, model)
		}
	}
	fallback = strings.TrimSpace(fallback)
	if fallback != "" && !seen[fallback] {
		out = append([]string{fallback}, out...)
	}
	return out
}
func (a *App) DeleteProfile(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	n := a.state.Profiles[:0]
	found := false
	for _, p := range a.state.Profiles {
		if p.ID == id {
			found = true
			continue
		}
		n = append(n, p)
	}
	if !found {
		return errors.New("Profile 不存在")
	}
	if len(n) > 0 {
		has := false
		for _, p := range n {
			has = has || p.IsDefault
		}
		if !has {
			n[0].IsDefault = true
		}
	}
	a.state.Profiles = n
	if err := a.saveLocked(); err != nil {
		return err
	}
	return a.saveKeysLocked()
}
func (a *App) SetDefaultProfile(id string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	found := false
	for i := range a.state.Profiles {
		a.state.Profiles[i].IsDefault = a.state.Profiles[i].ID == id
		found = found || a.state.Profiles[i].ID == id
	}
	if !found {
		return errors.New("Profile 不存在")
	}
	if err := a.saveLocked(); err != nil {
		return err
	}
	return a.saveKeysLocked()
}
func (a *App) ListAvailableModels(protocol, strategy string) []string {
	_ = strategy
	if protocol == "responses" {
		return []string{"gpt-image-1", "gpt-image-1-mini"}
	}
	return []string{"gpt-image-1", "gpt-image-1-mini", "dall-e-3", "dall-e-2"}
}
func (a *App) FetchModels(profileID string, in ProfileInput) ([]string, error) {
	a.mu.Lock()
	p := profileRecord{Profile: Profile{Protocol: in.Protocol, BaseURL: normalizeBase(in.BaseURL), Model: in.Model, TextModel: normalizeTextModel(in.TextModel), Strategy: in.Strategy}, APIKey: strings.TrimSpace(in.APIKey)}
	if profileID != "" {
		for _, stored := range a.state.Profiles {
			if stored.ID == profileID {
				p = stored
				if strings.TrimSpace(in.APIKey) != "" {
					p.APIKey = strings.TrimSpace(in.APIKey)
				}
				break
			}
		}
	}
	a.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	base := normalizeBase(p.BaseURL)
	endpoints := []string{base + "/models"}
	parsedURL, parseErr := url.Parse(base)
	if parseErr == nil && strings.Trim(parsedURL.Path, "/") == "" {
		// Many OpenAI-compatible gateways serve their API below /v1 while the
		// root path serves a web console HTML page.
		endpoints = append(endpoints, base+"/v1/models")
	}
	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	var lastStatus int
	var gotNonJSON bool
	for _, endpoint := range endpoints {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return nil, err
		}
		if p.APIKey != "" {
			req.Header.Set("Authorization", "Bearer "+p.APIKey)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		_ = resp.Body.Close()
		lastStatus = resp.StatusCode
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			continue
		}
		if json.Unmarshal(body, &parsed) == nil {
			break
		}
		gotNonJSON = true
	}
	if len(parsed.Data) == 0 {
		if lastStatus >= 400 {
			return nil, modelListHTTPError(lastStatus)
		}
		if gotNonJSON {
			return nil, errors.New("上游返回的不是 JSON 模型列表，请填写 OpenAI 兼容 API 地址，例如 https://api.example.com/v1")
		}
		return nil, errors.New("上游没有返回模型列表")
	}
	models := make([]string, 0, len(parsed.Data))
	for _, item := range parsed.Data {
		if strings.TrimSpace(item.ID) != "" {
			models = append(models, item.ID)
		}
	}
	if len(models) == 0 {
		return nil, errors.New("上游没有返回模型列表")
	}
	sort.Strings(models)
	return models, nil
}

func modelListHTTPError(status int) error {
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return errors.New("API Key 无效或无权限")
	case http.StatusNotFound:
		return errors.New("模型列表接口不存在，请检查 Base URL 是否填写到 /v1")
	case http.StatusTooManyRequests:
		return errors.New("请求过于频繁，请稍后再试")
	default:
		return fmt.Errorf("模型列表接口请求失败（HTTP %d）", status)
	}
}
func (a *App) TestProfile(in ProfileInput) TestResult {
	started := time.Now()
	if validateInput(in) != nil {
		return TestResult{Conclusion: "bad_url"}
	}
	p := profileRecord{Profile: Profile{Protocol: in.Protocol, BaseURL: normalizeBase(in.BaseURL), Model: in.Model, TextModel: normalizeTextModel(in.TextModel), Strategy: in.Strategy}, APIKey: in.APIKey}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	err := a.testEndpoint(ctx, p)
	if err != nil {
		return TestResult{Conclusion: testConclusion(err), LatencyMs: time.Since(started).Milliseconds()}
	}
	return TestResult{Conclusion: "ok", LatencyMs: time.Since(started).Milliseconds()}
}

func testConclusion(err error) string {
	code := classify(err)
	switch code {
	case "auth_failed":
		return "auth_failed"
	case "model_unavailable", "invalid_request":
		return "model_unavailable"
	default:
		return "bad_url"
	}
}

func (a *App) StartGeneration(req GenerationRequest) (GenerationJob, error) {
	a.mu.Lock()
	var p profileRecord
	found := false
	for _, v := range a.state.Profiles {
		if v.ID == req.ProfileID {
			p = v
			found = true
		}
	}
	if !found {
		a.mu.Unlock()
		return GenerationJob{}, errors.New("没有可用的 Profile，请先在设置中添加")
	}
	job := GenerationJob{ID: newID("j"), ProfileID: req.ProfileID, Prompt: req.Prompt, NegativePrompt: req.NegativePrompt, Model: req.Model, Size: req.Size, Quality: req.Quality, Format: req.Format, Status: "queued", CreatedAt: time.Now().UnixMilli()}
	a.state.Jobs = append([]GenerationJob{job}, a.state.Jobs...)
	_ = a.saveLocked()
	a.mu.Unlock()
	a.emit("generation.started", map[string]any{"type": "generation.started", "job": job})
	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	a.mu.Lock()
	a.running[job.ID] = cancel
	a.mu.Unlock()
	go a.runGeneration(ctx, job, p, req)
	return job, nil
}
func (a *App) runGeneration(ctx context.Context, job GenerationJob, p profileRecord, req GenerationRequest) {
	a.updateJob(job.ID, func(j *GenerationJob) { j.Status = "running" })
	a.emit("generation.progress", map[string]any{"type": "generation.progress", "jobId": job.ID, "progress": 0.05})
	asset, err := a.requestWithRetries(ctx, p, req)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			a.updateJob(job.ID, func(j *GenerationJob) { j.Status = "canceled" })
			a.emit("generation.canceled", map[string]any{"type": "generation.canceled", "job": a.job(job.ID)})
			a.mu.Lock()
			delete(a.running, job.ID)
			a.mu.Unlock()
			return
		}
		code := classify(err)
		a.updateJob(job.ID, func(j *GenerationJob) { j.Status = "failed"; j.ErrorCode = code; j.ErrorMessage = userError(err) })
		j := a.job(job.ID)
		a.emit("generation.failed", map[string]any{"type": "generation.failed", "job": j, "code": code, "message": j.ErrorMessage})
		a.mu.Lock()
		delete(a.running, job.ID)
		a.mu.Unlock()
		return
	}
	asset.JobID = job.ID
	asset.ID = newID("a")
	a.mu.Lock()
	a.state.Assets = append(a.state.Assets, asset)
	a.mu.Unlock()
	a.updateJob(job.ID, func(j *GenerationJob) { j.Status = "succeeded"; j.Progress = 1 })
	j := a.job(job.ID)
	a.emit("generation.completed", map[string]any{"type": "generation.completed", "job": j, "asset": asset})
	a.mu.Lock()
	delete(a.running, job.ID)
	_ = a.saveLocked()
	a.mu.Unlock()
}
func (a *App) CancelGeneration(id string) error {
	a.mu.Lock()
	c := a.running[id]
	a.mu.Unlock()
	if c != nil {
		c()
	}
	return nil
}
func (a *App) updateJob(id string, fn func(*GenerationJob)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	for i := range a.state.Jobs {
		if a.state.Jobs[i].ID == id {
			fn(&a.state.Jobs[i])
			_ = a.saveLocked()
			return
		}
	}
}
func (a *App) job(id string) GenerationJob {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, j := range a.state.Jobs {
		if j.ID == id {
			return j
		}
	}
	return GenerationJob{ID: id}
}
func (a *App) emit(name string, data any) {
	if a.ctx != nil {
		wailsruntime.EventsEmit(a.ctx, name, data)
	}
}

func (a *App) ListHistory(q HistoryQuery) HistoryPage {
	a.mu.Lock()
	defer a.mu.Unlock()
	limit := q.Limit
	if limit <= 0 {
		limit = 30
	}
	offset, _ := strconv.Atoi(q.Cursor)
	by := map[string]ImageAsset{}
	for _, v := range a.state.Assets {
		by[v.JobID] = v
	}
	jobs := make([]GenerationJob, 0)
	for _, j := range a.state.Jobs {
		if j.Status == "succeeded" {
			if _, ok := by[j.ID]; ok {
				jobs = append(jobs, j)
			}
		}
	}
	if offset >= len(jobs) {
		return HistoryPage{Items: []HistoryItem{}}
	}
	end := offset + limit
	if end > len(jobs) {
		end = len(jobs)
	}
	items := make([]HistoryItem, 0, end-offset)
	for _, j := range jobs[offset:end] {
		x := by[j.ID]
		items = append(items, HistoryItem{JobID: j.ID, Prompt: j.Prompt, NegativePrompt: j.NegativePrompt, Model: j.Model, Size: j.Size, Quality: j.Quality, Format: j.Format, CreatedAt: j.CreatedAt, ThumbnailURL: x.DisplayURL, AssetID: x.ID})
	}
	out := HistoryPage{Items: items}
	if end < len(jobs) {
		out.NextCursor = strconv.Itoa(end)
	}
	return out
}
func (a *App) DeleteHistory(jobID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, x := range a.state.Assets {
		if x.JobID == jobID {
			_ = os.Remove(x.FilePath)
		}
	}
	j := a.state.Jobs[:0]
	for _, x := range a.state.Jobs {
		if x.ID != jobID {
			j = append(j, x)
		}
	}
	a.state.Jobs = j
	x := a.state.Assets[:0]
	for _, v := range a.state.Assets {
		if v.JobID != jobID {
			x = append(x, v)
		}
	}
	a.state.Assets = x
	return a.saveLocked()
}
func (a *App) SaveImage(assetID string) (string, error) {
	a.mu.Lock()
	var source string
	for _, x := range a.state.Assets {
		if x.ID == assetID {
			source = x.FilePath
		}
	}
	a.mu.Unlock()
	if source == "" {
		return "", errors.New("图片资源不存在")
	}
	if a.ctx == nil {
		return source, nil
	}
	name := filepath.Base(source)
	target, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{Title: "保存图片", DefaultFilename: name, Filters: []wailsruntime.FileFilter{{DisplayName: "图片", Pattern: "*.png;*.jpg;*.jpeg;*.webp"}}})
	if err != nil || target == "" {
		return "", err
	}
	if err = copyFile(source, target); err != nil {
		return "", err
	}
	return target, nil
}
func copyFile(source, target string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(target)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		_ = out.Close()
		return err
	}
	return out.Close()
}
func (a *App) OpenImage(assetID string) error {
	a.mu.Lock()
	var path string
	for _, x := range a.state.Assets {
		if x.ID == assetID {
			path = x.FilePath
		}
	}
	a.mu.Unlock()
	if path == "" {
		return errors.New("图片资源不存在")
	}
	if os.PathSeparator == '\\' {
		return exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", path).Start()
	}
	return nil
}

func responsesPrompt(prompt, negativePrompt string) string {
	prompt = strings.TrimSpace(prompt)
	negativePrompt = strings.TrimSpace(negativePrompt)
	if negativePrompt == "" {
		return prompt
	}
	return prompt + "\n\nAvoid: " + negativePrompt
}

func (a *App) request(ctx context.Context, p profileRecord, req GenerationRequest) (ImageAsset, error) {
	endpoint := apiEndpoint(p.BaseURL, "images/generations")
	if p.Protocol == "responses" {
		endpoint = apiEndpoint(p.BaseURL, "responses")
	}
	body := map[string]any{"model": req.Model, "prompt": req.Prompt}
	if p.Protocol == "images" {
		if req.NegativePrompt != "" {
			body["negative_prompt"] = req.NegativePrompt
		}
		body["size"] = req.Size
		if strings.HasPrefix(strings.ToLower(req.Model), "gpt-image") {
			body["quality"] = req.Quality
			body["output_format"] = req.Format
		} else {
			body["quality"] = req.Quality
			body["response_format"] = "b64_json"
		}
	} else {
		body = map[string]any{
			"model": normalizeTextModel(p.TextModel),
			"input": []any{map[string]any{
				"role":    "user",
				"content": []any{map[string]any{"type": "input_text", "text": responsesPrompt(req.Prompt, req.NegativePrompt)}},
			}},
			"tools": []any{map[string]any{
				"type":          "image_generation",
				"model":         req.Model,
				"action":        "generate",
				"size":          req.Size,
				"quality":       req.Quality,
				"output_format": req.Format,
			}},
			"tool_choice": map[string]any{"type": "image_generation"},
			"store":       false,
			"stream":      false,
		}
	}
	raw, _ := json.Marshal(body)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(raw)))
	if err != nil {
		return ImageAsset{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if p.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+p.APIKey)
	}
	resp, err := (&http.Client{Timeout: requestTimeout}).Do(httpReq)
	if err != nil {
		return ImageAsset{}, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return ImageAsset{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ImageAsset{}, fmt.Errorf("upstream %d: %s", resp.StatusCode, string(data))
	}
	var parsed any
	if err = json.Unmarshal(data, &parsed); err != nil {
		return ImageAsset{}, fmt.Errorf("生图接口返回的不是 JSON（请求地址：%s），请确认协议类型和 Base URL 正确", endpoint)
	}
	encoded, imageURL := findImageResult(parsed)
	if imageURL != "" {
		return a.download(ctx, imageURL)
	}
	mime := "image/png"
	if encoded == "" {
		return ImageAsset{}, errors.New("响应中没有图片")
	}
	if strings.HasPrefix(encoded, "data:") {
		parts := strings.SplitN(encoded, ",", 2)
		if len(parts) == 2 {
			if strings.Contains(parts[0], "image/jpeg") {
				mime = "image/jpeg"
			}
			encoded = parts[1]
		}
	}
	bytes, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		bytes, err = base64.RawStdEncoding.DecodeString(encoded)
	}
	if err != nil {
		return ImageAsset{}, err
	}
	ext := "png"
	if mime == "image/jpeg" {
		ext = "jpg"
	}
	path := filepath.Join(a.dataDir, "images", newID("image")+"."+ext)
	if err = os.WriteFile(path, bytes, 0o600); err != nil {
		return ImageAsset{}, err
	}
	return ImageAsset{DisplayURL: imageDataURL(mime, bytes), FilePath: path, Width: 1024, Height: 1024}, nil
}

func findImageResult(value any) (encoded, imageURL string) {
	switch item := value.(type) {
	case []any:
		for _, child := range item {
			if encoded, imageURL = findImageResult(child); encoded != "" || imageURL != "" {
				return encoded, imageURL
			}
		}
	case map[string]any:
		if raw, ok := item["b64_json"].(string); ok && strings.TrimSpace(raw) != "" {
			return raw, ""
		}
		if raw, ok := item["url"].(string); ok && strings.TrimSpace(raw) != "" {
			return "", raw
		}
		if raw, ok := item["result"].(string); ok && strings.TrimSpace(raw) != "" {
			return raw, ""
		}
		for _, child := range item {
			if encoded, imageURL = findImageResult(child); encoded != "" || imageURL != "" {
				return encoded, imageURL
			}
		}
	}
	return "", ""
}

func (a *App) requestWithRetries(ctx context.Context, p profileRecord, req GenerationRequest) (ImageAsset, error) {
	var lastErr error
	for attempt := 1; attempt <= requestMaxAttempts; attempt++ {
		asset, err := a.request(ctx, p, req)
		if err == nil {
			return asset, nil
		}
		lastErr = err
		if !retryableRequestError(err) || attempt == requestMaxAttempts {
			break
		}
		timer := time.NewTimer(requestRetryDelay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ImageAsset{}, ctx.Err()
		case <-timer.C:
		}
	}
	return ImageAsset{}, lastErr
}

func retryableRequestError(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	if strings.Contains(s, "401") || strings.Contains(s, "403") || strings.Contains(s, "400") || strings.Contains(s, "422") {
		return false
	}
	return strings.Contains(s, "429") || strings.Contains(s, "upstream 5") ||
		strings.Contains(s, "timeout") || strings.Contains(s, "temporarily unavailable") ||
		strings.Contains(s, "connection reset") || strings.Contains(s, "connection refused")
}
func (a *App) testEndpoint(ctx context.Context, p profileRecord) error {
	base := normalizeBase(p.BaseURL)
	endpoints := []string{base + "/models"}
	parsedURL, parseErr := url.Parse(base)
	if parseErr == nil && strings.Trim(parsedURL.Path, "/") == "" {
		endpoints = append(endpoints, base+"/v1/models")
	}
	var lastErr error
	for _, endpoint := range endpoints {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return err
		}
		if p.APIKey != "" {
			req.Header.Set("Authorization", "Bearer "+p.APIKey)
		}
		resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		_ = resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastErr = fmt.Errorf("upstream %d: %s", resp.StatusCode, string(data))
			continue
		}
		var models struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		}
		if err := json.Unmarshal(data, &models); err != nil || len(models.Data) == 0 {
			lastErr = errors.New("模型列表响应无效")
			continue
		}
		for _, model := range models.Data {
			if model.ID == p.Model || (p.Protocol == "responses" && model.ID == p.TextModel) {
				return nil
			}
		}
		return fmt.Errorf("model unavailable: %s", p.Model)
	}
	return lastErr
}
func (a *App) download(ctx context.Context, rawURL string) (ImageAsset, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ImageAsset{}, errors.New("上游返回了无效的图片地址")
	}
	if u.Scheme == "http" && !isLoopbackHost(u.Hostname()) {
		return ImageAsset{}, errors.New("上游返回的图片地址不是安全 HTTPS 地址")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return ImageAsset{}, err
	}
	resp, err := (&http.Client{Timeout: requestTimeout}).Do(req)
	if err != nil {
		return ImageAsset{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ImageAsset{}, fmt.Errorf("image download %d", resp.StatusCode)
	}
	mime := strings.ToLower(strings.TrimSpace(strings.Split(resp.Header.Get("Content-Type"), ";")[0]))
	if mime != "image/jpeg" && mime != "image/webp" && mime != "image/png" {
		mime = "image/png"
	}
	ext := "png"
	if mime == "image/jpeg" {
		ext = "jpg"
	} else if mime == "image/webp" {
		ext = "webp"
	}
	path := filepath.Join(a.dataDir, "images", newID("image")+"."+ext)
	data, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return ImageAsset{}, err
	}
	if err = os.WriteFile(path, data, 0o600); err != nil {
		return ImageAsset{}, err
	}
	return ImageAsset{DisplayURL: imageDataURL(mime, data), FilePath: path, Width: 1024, Height: 1024}, nil
}
func classify(err error) string {
	s := strings.ToLower(err.Error())
	switch {
	case strings.Contains(s, "401"), strings.Contains(s, "403"):
		return "auth_failed"
	case strings.Contains(s, "429"):
		return "rate_limited"
	case strings.Contains(s, "400"), strings.Contains(s, "422"):
		return "invalid_request"
	case strings.Contains(s, "model"):
		return "model_unavailable"
	case strings.Contains(s, "timeout"):
		return "timeout"
	case strings.Contains(s, "接口返回的不是 json"), strings.Contains(s, "响应中没有图片"):
		return "upstream_error"
	case strings.Contains(s, "upstream"):
		return "upstream_error"
	default:
		return "network_error"
	}
}
func userError(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
