// AutoDL ComfyUI workflow inference.
//
// AutoDL wraps a ComfyUI graph as a workflow and exposes only the graph's core
// parameters. One workflow is one model here, and the workflow id in the URL is
// the model name. Submission only queues the task:
//
//   POST {baseUrl}/api/v1/comfyui/comfyui_workflow/{workflow_id}
//   GET  {baseUrl}/api/v1/comfyui/comfyui_workflow/{result}/result/{task_id}
//
// The token is passed through as the raw Authorization value; AutoDL accepts it
// with or without a Bearer prefix. Result URLs are short-lived, so they are
// handed to clients as returned instead of being proxied.
// https://autodl.art/docs/comfyui_api/

const TTS_MODEL = "indextts2-v1";

// Workflow capabilities transcribed from GET /api/v1/comfyui/workflows/{id}
// input_rules. Each entry lists the vendor resolution labels the workflow
// accepts, its longest clip, the parameters it reads, and the ones it cannot
// run without. The request builder sends nothing outside this declaration, so
// an OpenAI-shaped request never leaks foreign fields to AutoDL.
//
// Billing facts use the resolution tier alone (480p, 768p, ...): every AutoDL
// price table varies by tier, never by orientation.
const WORKFLOWS = {
  minimax_h3_lightx2v_no_pic: {
    action: "text_to_video",
    maxDuration: 15,
    required: ["prompt"],
    defaultResolution: "768p竖",
    resolutions: ["480p竖", "768p竖", "480p横", "768p横", "480p(1:1)", "768p(1:1)"],
  },
  minimax_h3_z0901: {
    action: "text_to_video",
    maxDuration: 15,
    required: ["prompt"],
    defaultResolution: "768p竖(768*1344)",
    resolutions: [
      "480p竖(480*864)", "480p横(864*480)",
      "768p竖(768*1344)", "768p横(1344*768)",
      "1088p竖(1088*1920)", "1088p横(1920*1088)",
      "1440p竖(1440*2560)", "1440p横(2560*1440)",
    ],
  },
  minimax_h3_b99_001: {
    action: "text_to_video",
    maxDuration: 15,
    required: ["prompt"],
    defaultResolution: "736p竖",
    resolutions: ["736p竖", "736p横", "736p(1:1)"],
  },
  minimax_h3_lightx2v: {
    action: "first_tail_to_video",
    maxDuration: 15,
    required: ["prompt", "first_frame", "last_frame"],
    frames: true,
    defaultResolution: "768p竖",
    resolutions: ["480p竖", "768p竖", "480p横", "768p横", "480p(1:1)", "768p(1:1)"],
  },
  minimax_h3_b99_002: {
    action: "first_tail_to_video",
    maxDuration: 15,
    required: ["prompt", "first_frame", "last_frame"],
    frames: true,
    defaultResolution: "736p竖",
    resolutions: ["736p竖", "736p横", "736p(1:1)"],
  },
  minimax_h3_b99_003_12s: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0"],
    images: 9,
    defaultResolution: "736p竖",
    resolutions: ["736p竖", "736p横", "736p(1:1)"],
  },
  minimax_h3_801: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0"],
    images: 9,
    extra: ["mode"],
    defaultResolution: "768p竖(768*1376)",
    resolutions: [
      "480p竖(480*864)", "768p竖(768*1376)", "1088p竖(1088*1920)", "1440p竖(1440*2560)",
      "480p横(864*480)", "768p横(1376*768)", "1088p横(1920*1088)", "1440p横(2560*1440)",
    ],
  },
  minimax_h3_802: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt"],
    images: 9,
    extra: ["mode"],
    defaultResolution: "768p竖(768*1376)",
    resolutions: [
      "480p竖(480*864)", "768p竖(768*1376)", "1088p竖(1088*1920)", "1440p竖(1440*2560)",
      "480p横(864*480)", "768p横(1376*768)", "1088p横(1920*1088)", "1440p横(2560*1440)",
    ],
  },
  minimax_h3_803: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt"],
    images: 9,
    audios: 3,
    extra: ["mode"],
    defaultResolution: "768p竖(768*1376)",
    resolutions: [
      "480p竖(480*864)", "768p竖(768*1376)", "1088p竖(1088*1920)", "1440p竖(1440*2560)",
      "480p横(864*480)", "768p横(1376*768)", "1088p横(1920*1088)", "1440p横(2560*1440)",
    ],
  },
  minimax_h3_804: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt"],
    images: 9,
    extra: ["style_preset"],
    defaultResolution: "768p竖(768*1376)",
    resolutions: [
      "480p竖(480*864)", "768p竖(768*1376)", "1088p竖(1088*1920)", "1440p竖(1440*2560)",
      "480p横(864*480)", "768p横(1376*768)", "1088p横(1920*1088)", "1440p横(2560*1440)",
    ],
  },
  minimax_h3_805: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt"],
    images: 9,
    audios: 3,
    extra: ["style_preset"],
    defaultResolution: "768p竖(768*1376)",
    resolutions: [
      "480p竖(480*864)", "768p竖(768*1376)", "1088p竖(1088*1920)", "1440p竖(1440*2560)",
      "480p横(864*480)", "768p横(1376*768)", "1088p横(1920*1088)", "1440p横(2560*1440)",
    ],
  },
  minimax_h3_z0902: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0"],
    images: 6,
    defaultResolution: "768p竖(768*1376)",
    resolutions: [
      "480p竖(480*864)", "480p横(864*480)",
      "768p竖(768*1376)", "768p横(1376*768)",
      "1088p竖(1088*1920)", "1088p横(1920*1088)",
      "1440p竖(1440*2560)", "1440p横(2560*1440)",
    ],
  },
  minimax_h3_z0903: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0", "ref_audio_0"],
    images: 6,
    audios: 3,
    defaultResolution: "768p竖(768*1376)",
    resolutions: [
      "480p竖(480*864)", "480p横(864*480)",
      "768p竖(768*1376)", "768p横(1376*768)",
      "1088p竖(1088*1920)", "1088p横(1920*1088)",
      "1440p竖(1440*2560)", "1440p横(2560*1440)",
    ],
  },
  minimax_h3_lightx2v_v5: {
    action: "reference_to_video",
    maxDuration: 10,
    required: ["prompt", "ref_image_0"],
    images: 9,
    defaultResolution: "768p竖",
    resolutions: [
      "480p竖", "768p竖", "1080p竖",
      "480p横", "768p横", "1080p横",
      "480p(1:1)", "768p(1:1)", "1080p(1:1)",
    ],
  },
  minimax_h3_lightx2v_v5_15s: {
    action: "reference_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0"],
    images: 9,
    defaultResolution: "768p竖",
    resolutions: ["480p竖", "768p竖", "480p横", "768p横", "480p(1:1)", "768p(1:1)"],
  },
  minimax_h3_image_audio_to_video: {
    action: "image_to_video",
    maxDuration: 15,
    durationField: "audio_duration",
    // This workflow takes no prompt: the motion follows the reference audio.
    prompt: false,
    required: ["ref_image_0", "ref_audio_0"],
    noSeed: true,
    images: 1,
    audios: 1,
    defaultResolution: "768p竖",
    resolutions: ["480p竖", "768p竖", "1080p竖", "480p横", "768p横", "1080p横"],
  },
  minimax_h3_image_audio_to_video_v2: {
    action: "image_to_video",
    maxDuration: 10,
    required: ["prompt"],
    images: 9,
    audios: 3,
    defaultResolution: "768p竖",
    resolutions: ["480p竖", "768p竖", "1080p竖", "480p横", "768p横", "1080p横"],
  },
  minimax_h3_image_audio_to_video_v2_15s: {
    action: "image_to_video",
    maxDuration: 15,
    required: ["prompt"],
    images: 9,
    audios: 3,
    defaultResolution: "768p竖",
    resolutions: ["480p竖", "768p竖", "480p横", "768p横"],
  },
  minimax_h3_zm_nono: {
    action: "image_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0"],
    noSeed: true,
    images: 9,
    audios: 3,
    defaultResolution: "768p竖",
    resolutions: ["480p横", "480p竖", "768p横", "768p竖", "960p横", "960p竖"],
  },
  minimax_h3_zm_u08: {
    action: "image_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0"],
    images: 9,
    audios: 3,
    seedMin: 0,
    defaultResolution: "768p竖",
    resolutions: ["480p横", "480p竖", "768p横", "768p竖", "480p(1:1)", "768p(1:1)"],
  },
  minimax_h3_zm_u24: {
    action: "image_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0"],
    images: 9,
    audios: 3,
    seedMin: 0,
    defaultResolution: "768p竖",
    resolutions: ["480p横", "480p竖", "768p横", "768p竖", "480p(1:1)", "768p(1:1)"],
  },
  minimax_h3_zm_u30: {
    action: "image_to_video",
    maxDuration: 15,
    required: ["prompt", "ref_image_0"],
    images: 9,
    audios: 3,
    seedMin: 0,
    defaultResolution: "768p竖",
    resolutions: ["480p横", "480p竖", "768p横", "768p竖", "960p横", "960p竖"],
  },
  // Motion retargeting has no duration input: AutoDL renders one output second
  // per input second, so the clip length is measured from the finished video.
  "wan2.2animate-v4-motion_retargeting": {
    action: "image_to_video",
    prompt: false,
    required: ["ref_image", "ref_video"],
    imageInput: "ref_image",
    videoInput: "ref_video",
    outputSecondsProbe: "video",
    reserveSeconds: 15,
    resolutionFact: false,
    defaultResolution: "464*832px(竖版)",
    resolutions: ["464*832px(竖版)", "832*464px(横版)"],
  },
};

const VIDEO_MODELS = Object.keys(WORKFLOWS);

// Resolution tiers across the video catalog. Each workflow reports one of the
// tiers it supports, and AutoDL prices per tier.
const VIDEO_TIERS = ["480p", "736p", "768p", "960p", "1080p", "1088p", "1440p"];

// Sizes are matched to the supported tier by short side.
const TIER_THRESHOLDS = [480, 736, 768, 960, 1080, 1088, 1440];

const TTS_PARAMS = [
  "emo_control_method",
  "emo_ref_audio",
  "emo_random",
  "emo_happy",
  "emo_angry",
  "emo_sad",
  "emo_afraid",
  "emo_disgusted",
  "emo_melancholic",
  "emo_surprised",
  "emo_calm",
];
const TTS_DEFAULT_CONTROL = "与音色参考音频相同";

// AutoDL rejects durations outside this range for every video workflow.
const MIN_DURATION = 1;
const DEFAULT_DURATION = 5;
const MAX_SEED = 100000000000000000;

// Speech synthesis is billed by generated audio second. AutoDL reports no
// duration, so it is estimated from the text for the reservation and measured
// from the output WAV header when the task completes.
const OUTPUT_SECONDS_CAP = 3600;
const CJK_CHARS_PER_SECOND = 4.5;
const LATIN_CHARS_PER_SECOND = 15;

export const meta = {
  apiVersion: 1,
  key: "comfyui",
  name: "AutoDL ComfyUI",
  icon: "text",
  description: {
    en: "AutoDL ComfyUI workflow inference (video generation and speech synthesis)",
    zh: "AutoDL ComfyUI 工作流推理（视频生成与语音合成）",
  },
  version: "1.1.0",
  author: { name: "AutoDL" },
  models: VIDEO_MODELS.concat([TTS_MODEL]),
  fetchMode: "per_task",
  baseUrl: "https://autodl.art",
  // Generated media is read back from AutoDL's object storage: the audio probe
  // reads WAV headers and the retargeting probe reads MP4 headers there. Add
  // more buckets here if an account stores outputs elsewhere.
  allowedHosts: [
    "cg-comfyui-prod.tos-cn-beijing.volces.com",
    "codewithgpu-test-1310972338.cos.ap-beijing.myqcloud.com",
  ],
  usageSchema: {
    seconds: {
      type: "number",
      unit: "second",
      description: { en: "Video generation unit price", zh: "视频生成单价" },
    },
    resolution: {
      enum: VIDEO_TIERS,
      enumLabels: {
        "480p": { en: "480p", zh: "480p" },
        "736p": { en: "736p", zh: "736p" },
        "768p": { en: "768p", zh: "768p" },
        "960p": { en: "960p", zh: "960p" },
        "1080p": { en: "1080p", zh: "1080p" },
        "1088p": { en: "1088p", zh: "1088p" },
        "1440p": { en: "1440p", zh: "1440p" },
      },
      description: { en: "Output video resolution", zh: "输出视频分辨率" },
    },
  },
  usageExamples: [
    { label: "5s · 768p", facts: { seconds: 5, resolution: "768p" } },
    { label: "10s · 480p", facts: { seconds: 10, resolution: "480p" } },
  ],
  usageProfiles: [
    {
      // AutoDL bills speech synthesis per generated audio second but returns
      // no duration, so the output WAV header is read while polling.
      models: [TTS_MODEL],
      schema: {
        seconds: {
          type: "number",
          unit: "second",
          description: { en: "Speech synthesis unit price", zh: "语音合成单价" },
        },
      },
      examples: [{ label: "10s", facts: { seconds: 10 } }],
    },
    {
      // The retargeted clip follows the reference video's length and no
      // resolution tier affects its price.
      models: ["wan2.2animate-v4-motion_retargeting"],
      schema: {
        seconds: {
          type: "number",
          unit: "second",
          description: { en: "Video generation unit price", zh: "视频生成单价" },
        },
      },
      examples: [{ label: "10s", facts: { seconds: 10 } }],
    },
  ],
  protocols: [
    { name: "openai_responses", supports: ["stream", "sync", "background"] },
    "openai_video",
  ],
};

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function isInteger(number) {
  return Number.isFinite(number) && number === Math.trunc(number);
}

// Rough speaking rate used to reserve before the audio exists. The measured
// duration replaces it on completion, refunding or charging the difference.
function estimatedSpeechSeconds(source) {
  const request = source || {};
  const text = trimmed(request.prompt_text) || trimmed(request.prompt);
  let cjk = 0;
  let latin = 0;
  for (const character of text) {
    if (/[぀-ヿ㐀-鿿가-힯]/.test(character)) cjk += 1;
    else latin += 1;
  }
  const seconds = cjk / CJK_CHARS_PER_SECOND + latin / LATIN_CHARS_PER_SECOND;
  return Math.min(Math.max(Math.ceil(seconds), MIN_DURATION), OUTPUT_SECONDS_CAP);
}

function firstUrl(value) {
  return trimmed(value);
}

// Splits an AutoDL resolution label such as "768p横(1376*768)" or
// "464*832px(竖版)" into the billing tier and the orientation.
function resolutionParts(value) {
  const text = trimmed(value);
  const orientation = text.includes("竖") ? "竖" : text.includes("横") ? "横" : text.includes("1:1") ? "(1:1)" : "";
  const tierMatch = /^(\d+)\s*p/i.exec(text);
  if (tierMatch) return { tier: tierMatch[1] + "p", orientation: orientation };
  const sizeMatch = /^(\d+)\s*[*x×]\s*(\d+)/i.exec(text);
  if (sizeMatch) return { tier: sizeMatch[1] + "*" + sizeMatch[2], orientation: orientation };
  return { tier: "", orientation: orientation };
}

function tierNumber(tier) {
  const number = Number.parseInt(tier, 10);
  return Number.isFinite(number) ? number : 0;
}

// Picks the label the workflow supports for a requested tier and orientation.
// A workflow may not offer the exact tier (736p vs 768p, 1080p vs 1088p), so
// the nearest supported tier of the same orientation is used; the billing
// facts report that tier, never the one the client asked for.
function supportedResolution(spec, tier, orientation) {
  const labels = spec.resolutions;
  const exact = labels.find(function (label) {
    const parts = resolutionParts(label);
    return parts.tier === tier && parts.orientation === orientation;
  });
  if (exact) return exact;
  const sameOrientation = labels.filter(function (label) {
    return resolutionParts(label).orientation === orientation;
  });
  const pool = sameOrientation.length ? sameOrientation : labels;
  let best = "";
  let bestDistance = Infinity;
  for (const label of pool) {
    const distance = Math.abs(tierNumber(resolutionParts(label).tier) - tierNumber(tier));
    if (distance < bestDistance) {
      best = label;
      bestDistance = distance;
    }
  }
  return best;
}

function sizeResolution(spec, size) {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(trimmed(size));
  if (!match) throw new Error("size must be formatted as WIDTHxHEIGHT");
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0 && height > 0)) throw new Error("size must be formatted as WIDTHxHEIGHT");
  const shortSide = Math.min(width, height);
  const threshold = TIER_THRESHOLDS.find(function (value) {
    return shortSide <= value;
  });
  const tier = (threshold === undefined ? TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1] : threshold) + "p";
  const orientation = width > height ? "横" : width < height ? "竖" : "(1:1)";
  return supportedResolution(spec, tier, orientation);
}

function resolveResolution(spec, source) {
  const requested = trimmed(source.resolution);
  if (requested) {
    const parts = resolutionParts(requested);
    if (!parts.tier) throw new Error("resolution must be one of: " + spec.resolutions.join(", "));
    const label = supportedResolution(spec, parts.tier, parts.orientation);
    if (!label) throw new Error("resolution must be one of: " + spec.resolutions.join(", "));
    return label;
  }
  if (trimmed(source.size)) return sizeResolution(spec, source.size);
  return "";
}

function duration(value, spec, field) {
  const number = Number(value);
  if (!isInteger(number)) throw new Error(field + " must be a whole number of seconds");
  if (number < MIN_DURATION || number > spec.maxDuration) {
    throw new Error(field + " must be between " + MIN_DURATION + " and " + spec.maxDuration + " seconds");
  }
  return number;
}

function resolveDuration(spec, source) {
  if (spec.maxDuration === undefined) return null;
  const field = spec.durationField || "duration";
  for (const key of [field, "duration", "seconds"]) {
    if (source[key] !== undefined && source[key] !== null) return duration(source[key], spec, field);
  }
  return null;
}

function resolveSeed(spec, source) {
  if (source.seed === undefined || source.seed === null) return null;
  const seed = Number(source.seed);
  const minimum = spec.seedMin === undefined ? 1 : spec.seedMin;
  if (!isInteger(seed) || seed < minimum || seed > MAX_SEED) {
    throw new Error("seed must be an integer between " + minimum + " and " + MAX_SEED);
  }
  return seed;
}

// Parameters each workflow reads, from the capability table. Anything else in
// the client body is dropped.
function workflowParams(spec) {
  const params = ["prompt", "resolution"];
  if (!spec.noSeed) params.push("seed");
  if (spec.maxDuration !== undefined) params.push(spec.durationField || "duration");
  for (let index = 0; index < (spec.images || 0); index += 1) params.push("ref_image_" + index);
  for (let index = 0; index < (spec.audios || 0); index += 1) params.push("ref_audio_" + index);
  if (spec.frames) params.push("first_frame", "last_frame");
  if (spec.imageInput) params.push(spec.imageInput);
  if (spec.videoInput) params.push(spec.videoInput);
  return params.concat(spec.extra || []);
}

// Maps the OpenAI image reference onto the workflow's first image input.
function requestSource(model, request) {
  const source = Object.assign({}, request);
  if (model === TTS_MODEL) return source;
  const spec = WORKFLOWS[model] || {};
  const reference = trimmed(source.input_reference) || trimmed(source.image);
  if (!reference) return source;
  if (spec.frames) {
    if (!trimmed(source.first_frame)) source.first_frame = reference;
  } else if (spec.imageInput) {
    if (!trimmed(source[spec.imageInput])) source[spec.imageInput] = reference;
  } else if ((spec.images || 0) > 0) {
    if (!trimmed(source.ref_image_0)) source.ref_image_0 = reference;
  }
  return source;
}

// Builds the AutoDL request body from the normalized client request. Required
// vendor parameters are enforced in buildSubmitRequest so that a decoder call
// during channel selection stays free of workflow-specific requirements.
function workflowBody(model, source) {
  if (model === TTS_MODEL) {
    const body = {};
    const text = trimmed(source.prompt_text) || trimmed(source.prompt);
    const sample = trimmed(source.prompt_simple) || trimmed(source.input_reference) || trimmed(source.audio);
    if (text) body.prompt_text = text;
    if (sample) body.prompt_simple = sample;
    body.emo_control_method = trimmed(source.emo_control_method) || TTS_DEFAULT_CONTROL;
    for (const key of TTS_PARAMS) {
      if (key === "emo_control_method") continue;
      if (source[key] !== undefined && source[key] !== null) body[key] = source[key];
    }
    return body;
  }
  const spec = WORKFLOWS[model];
  if (!spec) throw new Error("unsupported model: " + model);
  const body = {};
  if (spec.prompt !== false) {
    const prompt = trimmed(source.prompt);
    if (prompt) body.prompt = prompt;
  }
  const durationField = spec.durationField || "duration";
  const seconds = resolveDuration(spec, source);
  if (seconds !== null) body[durationField] = seconds;
  // The default label is sent explicitly so the billed tier always matches the
  // tier the facts report.
  const resolution = resolveResolution(spec, source) || spec.defaultResolution;
  body.resolution = resolution;
  const seed = spec.noSeed ? null : resolveSeed(spec, source);
  if (seed !== null) body.seed = seed;
  for (const key of workflowParams(spec)) {
    if (["prompt", "resolution", "seed", durationField].includes(key)) continue;
    const value = source[key];
    if (value === undefined || value === null) continue;
    const text = trimmed(value);
    if (text) body[key] = text;
  }
  return body;
}

function upstreamModelOf(ctx) {
  return trimmed((ctx && ctx.upstreamModel) || (ctx && ctx.model));
}

function submitUrl(ctx, model) {
  return trimmed(ctx.baseUrl).replace(/\/+$/, "") + "/api/v1/comfyui/comfyui_workflow/" + encodeURIComponent(model);
}

function resultUrl(ctx, taskId) {
  return trimmed(ctx.baseUrl).replace(/\/+$/, "") + "/api/v1/comfyui/comfyui_workflow/result/" + encodeURIComponent(taskId);
}

function comfyHeaders(ctx) {
  return { Authorization: trimmed(ctx.apiKey), "Content-Type": "application/json" };
}

// Collects the media entries AutoDL returns under data.results.
function resultEntries(value) {
  const data = value && typeof value === "object" ? value.data : null;
  if (!data || typeof data !== "object" || !Array.isArray(data.results)) return [];
  return data.results.filter(function (entry) {
    return entry && typeof entry === "object" && trimmed(entry.url);
  });
}

function resultText(entries) {
  const entry = entries[0];
  const url = trimmed(entry && entry.url);
  if (!url) throw new Error("generated media is unavailable");
  const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (trimmed(entry.type) === "video") return '<video controls src="' + escaped + '"></video>';
  return escaped;
}

// Length of a clip AutoDL reports only through the finished file, used by the
// workflows whose duration follows an input the vendor measures itself.
function measuredSecondsProbe(model) {
  if (model === TTS_MODEL) return "audio";
  const spec = WORKFLOWS[model];
  return spec ? spec.outputSecondsProbe : undefined;
}

export function buildSubmitRequest(ctx) {
  const model = upstreamModelOf(ctx);
  const body = workflowBody(model, requestSource(model, ctx.requestBody || {}));
  if (model === TTS_MODEL) {
    if (!body.prompt_text) throw new Error("prompt_text is required");
    if (!body.prompt_simple) throw new Error("prompt_simple audio URL is required");
  } else {
    for (const key of WORKFLOWS[model].required) {
      if (!trimmed(body[key])) throw new Error(key + " is required");
    }
  }
  return {
    url: submitUrl(ctx, model),
    method: "POST",
    headers: comfyHeaders(ctx),
    body: body,
    action: ctx.action,
  };
}

export function parseSubmitResponse(ctx, resp) {
  const body = (resp && resp.body) || {};
  if (body.code !== "Success") {
    const message = trimmed(body.msg) || trimmed((body.error || {}).message) || "AutoDL rejected the task";
    throw new Error(message);
  }
  const data = body.data || {};
  const taskId = trimmed(data.task_id);
  if (!taskId) throw new Error("task_id is empty");
  return { taskId: taskId, taskData: body };
}

export function extractUsage(ctx) {
  const model = upstreamModelOf(ctx);
  const source = ctx.requestBody || {};
  if (model === TTS_MODEL) return { seconds: estimatedSpeechSeconds(source) };
  const spec = WORKFLOWS[model];
  if (!spec) throw new Error("unsupported model: " + model);
  // The retargeting workflow follows the reference video's length, so the
  // reservation is its longest sensible clip rather than a client input.
  const raw = spec.maxDuration === undefined ? spec.reserveSeconds : source[spec.durationField || "duration"];
  const seconds = raw === undefined || raw === null ? (spec.maxDuration === undefined ? spec.reserveSeconds : DEFAULT_DURATION) : Number(raw);
  if (!Number.isFinite(seconds) || seconds < MIN_DURATION) {
    throw new Error((spec.durationField || "duration") + " must be between " + MIN_DURATION + " and " + (spec.maxDuration || OUTPUT_SECONDS_CAP) + " seconds");
  }
  const facts = { seconds: Math.min(seconds, OUTPUT_SECONDS_CAP) };
  if (spec.resolutionFact !== false) {
    const requested = trimmed(source.resolution);
    facts.resolution = requested ? resolutionParts(requested).tier : resolutionParts(spec.defaultResolution).tier;
  }
  return facts;
}

// Speech and retargeted video settle on the measured length of the output file;
// the other workflows keep the frozen submission facts, which AutoDL does not
// contradict.
export function extractUsageOnComplete(ctx, result) {
  const probe = measuredSecondsProbe(upstreamModelOf(ctx));
  if (!probe) return null;
  // The poll that measured the file passes its state in the result; earlier
  // polls left theirs on the task.
  const state = plainObject(result && result.plugin_state) || plainObject(ctx && ctx.state) || {};
  const seconds = Number(state[probe === "audio" ? "audio_seconds" : "video_seconds"]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return { seconds: Math.min(seconds, OUTPUT_SECONDS_CAP) };
}

export function buildQueryRequest(ctx) {
  return { url: resultUrl(ctx, ctx.taskId), method: "GET", headers: comfyHeaders(ctx) };
}

const ARTIFACT_TYPES = ["video", "audio", "image"];

function artifactKey(index) {
  return index === 0 ? "media" : "media_" + index;
}

function artifactIndex(key) {
  if (key === "media") return 0;
  const match = /^media_(\d+)$/.exec(trimmed(key));
  return match ? Number(match[1]) : -1;
}

function artifactType(entry) {
  const type = trimmed(entry && entry.type).toLowerCase();
  return ARTIFACT_TYPES.includes(type) ? type : "file";
}

// The media URLs AutoDL hands out are short-lived, so the gateway proxies them
// while they are still valid and never forwards the channel credentials to the
// storage host.
export function listArtifacts(ctx) {
  if (String((ctx && ctx.status) || "").toUpperCase() !== "SUCCESS") return [];
  return resultEntries(ctx && ctx.data).map(function (entry, index) {
    return { key: artifactKey(index), type: artifactType(entry) };
  });
}

export function buildContentRequest(ctx) {
  const entries = resultEntries(ctx && ctx.data);
  const index = artifactIndex(ctx.artifactKey);
  const entry = index >= 0 && index < entries.length ? entries[index] : null;
  if (!entry) throw new Error("artifact_not_found");
  // The storage host rejects HEAD on its signed URLs, so a client HEAD is
  // answered by a GET whose body is discarded.
  return { url: trimmed(entry.url), method: "GET", credentialless: true };
}

// The output length is read from the finished file because AutoDL reports no
// duration for speech synthesis or retargeted video. The probe reads a ranged
// slice: a RIFF header for WAV, the mvhd box for MP4. A failed or unrecognized
// read keeps the submission estimate.
const PROBE_READ_BYTES = 64 * 1024;

function littleEndian32(bytes, offset) {
  return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 16777216;
}

// MP4 boxes are big-endian, unlike WAV chunks.
function bigEndian32(bytes, offset) {
  return bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3];
}

function bigEndian64(bytes, offset) {
  return bigEndian32(bytes, offset) * 4294967296 + bigEndian32(bytes, offset + 4);
}

function ascii(bytes, offset, length) {
  let text = "";
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[offset + index]);
  return text;
}

function readBytes(url, range) {
  try {
    const response = utils.fetch({ url: url, headers: { Range: range }, responseType: "bytes" });
    if (response.status !== 200 && response.status !== 206) return null;
    return new Uint8Array(response.body);
  } catch (_error) {
    return null;
  }
}

function wavSeconds(bytes) {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return 0;
  let offset = 12;
  let byteRate = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = littleEndian32(bytes, offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      if (body + 12 > bytes.length) return 0;
      byteRate = littleEndian32(bytes, body + 8);
    } else if (id === "data") {
      // 0 means "to end of stream" and 0xFFFFFFFF means unknown.
      if (!(byteRate > 0) || size <= 0 || size === 4294967295) return 0;
      return roundSeconds(size / byteRate);
    }
    offset = body + size + (size % 2);
  }
  return 0;
}

// Locates the moov box in a window that either runs to the end of the file
// (a suffix read, where moov is usually the last top-level box) or starts at
// its first byte (a faststart file, where moov comes first).
function movieBox(bytes, atEnd) {
  if (atEnd) {
    for (let offset = bytes.length - 4; offset >= 4; offset -= 1) {
      if (ascii(bytes, offset, 4) !== "moov") continue;
      const start = offset - 4;
      const size = bigEndian32(bytes, start);
      if (size >= 8 && start + size === bytes.length) return { start: start, end: start + size };
    }
    return null;
  }
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const size = bigEndian32(bytes, offset);
    if (size < 8) return null;
    const end = offset + size;
    if (ascii(bytes, offset + 4, 4) === "moov") return end <= bytes.length ? { start: offset, end: end } : null;
    if (end > bytes.length) return null;
    offset = end;
  }
  return null;
}

// Reads the movie duration from the mvhd box inside moov.
function movieHeaderSeconds(bytes, movie) {
  let offset = movie.start + 8;
  while (offset + 8 <= movie.end) {
    const size = bigEndian32(bytes, offset);
    if (size < 8 || offset + size > movie.end) return 0;
    if (ascii(bytes, offset + 4, 4) === "mvhd") {
      const version = bytes[offset + 8];
      const timescale = version === 1 ? bigEndian32(bytes, offset + 28) : bigEndian32(bytes, offset + 20);
      const duration = version === 1 ? bigEndian64(bytes, offset + 32) : bigEndian32(bytes, offset + 24);
      if (!(timescale > 0) || !(duration > 0)) return 0;
      return roundSeconds(duration / timescale);
    }
    offset += size;
  }
  return 0;
}

function mp4Seconds(bytes, atEnd) {
  const movie = movieBox(bytes, atEnd);
  return movie ? movieHeaderSeconds(bytes, movie) : 0;
}

function roundSeconds(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 100) / 100 : 0;
}

function audioSeconds(url) {
  const bytes = readBytes(url, "bytes=0-" + (PROBE_READ_BYTES - 1));
  return bytes ? wavSeconds(bytes) : 0;
}

function videoSeconds(url) {
  // MP4 files may store the moov box at either end, so both edges are probed.
  const tail = readBytes(url, "bytes=-" + PROBE_READ_BYTES);
  const fromTail = tail ? mp4Seconds(tail, true) : 0;
  if (fromTail > 0) return fromTail;
  const head = readBytes(url, "bytes=0-" + (PROBE_READ_BYTES - 1));
  return head ? mp4Seconds(head, false) : 0;
}

export function parseTaskResult(ctx, body) {
  const payload = body && typeof body === "object" ? body : {};
  if (trimmed(payload.code) && payload.code !== "Success") {
    return { status: "UNKNOWN", reason: trimmed(payload.msg) || "AutoDL returned an error" };
  }
  const data = payload.data || {};
  const status = trimmed(data.status).toUpperCase();
  switch (status) {
    case "QUEUED":
    case "PENDING":
      return { status: "QUEUED", progress: "0%" };
    case "RUNNING":
    case "IN_PROGRESS":
    case "STARTED":
      return { status: "IN_PROGRESS", progress: "50%" };
    case "SUCCESS":
    case "SUCCEEDED":
    case "COMPLETED": {
      const entries = resultEntries(payload);
      const url = firstUrl((entries[0] || {}).url);
      const result = { status: "SUCCESS", progress: "100%", url: url, remoteUrl: url };
      const probe = measuredSecondsProbe(upstreamModelOf(ctx));
      const seconds = url && probe === "audio" ? audioSeconds(url) : url && probe === "video" ? videoSeconds(url) : 0;
      if (seconds > 0) {
        const stateKey = probe === "audio" ? "audio_seconds" : "video_seconds";
        const state = Object.assign({}, plainObject(ctx && ctx.state));
        state[stateKey] = seconds;
        result.state = state;
      }
      return result;
    }
    case "FAILED":
    case "FAILURE":
    case "CANCELED":
    case "CANCELLED":
    case "TIMEOUT":
      return { status: "FAILURE", progress: "100%", reason: trimmed(data.message) || trimmed(payload.msg) || "task failed" };
    default:
      return { status: "UNKNOWN", reason: "unrecognized status: " + trimmed(data.status) };
  }
}

export const protocols = {
  openai_video: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const req = ctx.body.value;
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("request body must be an object");
      const model = trimmed(ctx.model || req.model);
      if (!model) throw new Error("model is required");
      const upstream = upstreamModelOf(ctx) || model;
      return {
        kind: "submit",
        model: model,
        action: upstream === TTS_MODEL ? "text_to_speech" : WORKFLOWS[upstream].action,
        requestBody: workflowBody(upstream, requestSource(upstream, req)),
      };
    },
    render: function (ctx, task) {
      const view = task || {};
      const entries = resultEntries(view.data);
      const output = { results: entries };
      if (entries.length) output.url = trimmed(entries[0].url);
      if (String(view.status || "").toUpperCase() === "FAILURE") {
        output.error = { code: "video_generation_failed", message: trimmed(view.fail_reason) || "The task failed." };
      }
      return output;
    },
  },
  openai_responses: {
    decodeRequest: function (ctx) {
      if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
      const req = ctx.body.value;
      if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("request body must be an object");
      const model = trimmed(ctx.model || req.model);
      if (!model) throw new Error("model is required");
      const prompt = responsesPrompt(req);
      if (!prompt) throw new Error("input is required");
      const upstream = upstreamModelOf(ctx) || model;
      const source = { prompt: prompt };
      const reference = trimmed(req.image) || trimmed(req.input_reference);
      if (reference) source.input_reference = reference;
      return {
        kind: "submit",
        model: model,
        action: upstream === TTS_MODEL ? "text_to_speech" : WORKFLOWS[upstream].action,
        requestBody: workflowBody(upstream, requestSource(upstream, source)),
      };
    },
    renderEvents: function (ctx, task, previousState) {
      const status = String((task && task.status) || "UNKNOWN").toUpperCase();
      const progressValue = Number(String((task && task.progress) || "").replace("%", ""));
      const progress = Number.isFinite(progressValue) && progressValue >= 0 && progressValue <= 100 ? progressValue : null;
      const state = { status: status, progress: progress };
      if (status === "SUCCESS") {
        const text = resultText(resultEntries(task && task.data));
        const events = previousState && previousState.status === status ? [] : [{ type: "output", data: text }];
        return { events: events, state: state, done: true };
      }
      if (status === "FAILURE") {
        return {
          events: [{ type: "error", code: "task_failed", message: trimmed(task && task.fail_reason) || "task failed" }],
          state: state,
          done: true,
        };
      }
      if (previousState && previousState.status === status && previousState.progress === progress) {
        return { events: [], state: state, done: false };
      }
      const event = { type: "progress", message: status.toLowerCase() };
      if (progress !== null) event.progress = progress;
      return { events: [event], state: state, done: false };
    },
    renderFinal: function (ctx, task) {
      return {
        output: [
          {
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: resultText(resultEntries(task && task.data)), annotations: [], logprobs: [] }],
          },
        ],
        metadata: { vendor: "comfyui" },
      };
    },
  },
};

function responsesPrompt(req) {
  const input = req.input;
  if (typeof input === "string") return trimmed(input);
  if (!Array.isArray(input)) return trimmed(req.prompt);
  const texts = [];
  for (const item of input) {
    if (typeof item === "string") {
      texts.push(item);
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const content = item.content === undefined ? [item] : Array.isArray(item.content) ? item.content : [item.content];
    for (const part of content) {
      if (typeof part === "string") {
        texts.push(part);
        continue;
      }
      if (part && typeof part === "object" && ["input_text", "text"].includes(part.type) && typeof part.text === "string") texts.push(part.text);
    }
  }
  return texts
    .map(trimmed)
    .filter(function (text) {
      return text;
    })
    .join("\n");
}
