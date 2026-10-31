package plugins_test

import (
	"context"
	"encoding/binary"
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const comfyVideoModel = "minimax_h3_lightx2v_no_pic"
const comfyTTSModel = "indextts2-v1"
const comfyRetargetingModel = "wan2.2animate-v4-motion_retargeting"

func newComfyPlugin(t *testing.T) *jsplugin.LoadedPlugin {
	t.Helper()
	source, err := builtinplugins.Source("comfyui")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "comfyui"})
	require.NoError(t, err)
	return plugin
}

func callComfy(t *testing.T, plugin *jsplugin.LoadedPlugin, path []string, args ...any) map[string]any {
	t.Helper()
	value, err := plugin.Engine.CallPath(t.Context(), path[0], path[1:], args...)
	require.NoError(t, err)
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	var decoded map[string]any
	require.NoError(t, common.Unmarshal(encoded, &decoded))
	return decoded
}

func comfyDecode(t *testing.T, plugin *jsplugin.LoadedPlugin, model string, request map[string]any) map[string]any {
	t.Helper()
	value := map[string]any{"model": model}
	for key, item := range request {
		value[key] = item
	}
	return callComfy(t, plugin, []string{"protocols", "openai_video", "decodeRequest"}, map[string]any{
		"model":         model,
		"upstreamModel": model,
		"body":          map[string]any{"kind": "json", "value": value},
	})
}

func comfyUsage(t *testing.T, plugin *jsplugin.LoadedPlugin, model string, requestBody map[string]any) map[string]any {
	t.Helper()
	return callComfy(t, plugin, []string{"extractUsage"}, map[string]any{
		"model":         model,
		"upstreamModel": model,
		"requestBody":   requestBody,
	})
}

func refImages(count int) map[string]any {
	values := map[string]any{}
	for index := 0; index < count; index++ {
		values[fmt.Sprintf("ref_image_%d", index)] = fmt.Sprintf("https://cdn.example/image-%d.png", index)
	}
	return values
}

func refAudios(count int) map[string]any {
	values := map[string]any{}
	for index := 0; index < count; index++ {
		values[fmt.Sprintf("ref_audio_%d", index)] = fmt.Sprintf("https://cdn.example/audio-%d.wav", index)
	}
	return values
}

func mergeValues(groups ...map[string]any) map[string]any {
	merged := map[string]any{}
	for _, group := range groups {
		for key, value := range group {
			merged[key] = value
		}
	}
	return merged
}

func TestComfyUIVideoRequestBuildsWorkflowBody(t *testing.T) {
	plugin := newComfyPlugin(t)

	decode := comfyDecode(t, plugin, comfyVideoModel, map[string]any{
		"prompt":  "a cat walking on the beach",
		"seconds": 8,
		"size":    "1280x720",
		"seed":    42,
	})
	assert.Equal(t, comfyVideoModel, decode["model"])
	assert.Equal(t, "text_to_video", decode["action"])
	assert.Equal(t, map[string]any{
		"prompt":     "a cat walking on the beach",
		"duration":   float64(8),
		"resolution": "768p横",
		"seed":       float64(42),
	}, decode["requestBody"])

	submit := callComfy(t, plugin, []string{"buildSubmitRequest"}, map[string]any{
		"baseUrl":       "https://autodl.art",
		"apiKey":        "token-under-test",
		"model":         comfyVideoModel,
		"upstreamModel": comfyVideoModel,
		"action":        "text_to_video",
		"requestBody":   decode["requestBody"],
	})
	assert.Equal(t, "https://autodl.art/api/v1/comfyui/comfyui_workflow/"+comfyVideoModel, submit["url"])
	assert.Equal(t, "POST", submit["method"])
	assert.Equal(t, map[string]any{"Authorization": "token-under-test", "Content-Type": "application/json"}, submit["headers"])
}

// Every workflow family reads a different slice of the request. The body must
// carry exactly the parameters that workflow accepts.
func TestComfyUIWorkflowFamilies(t *testing.T) {
	plugin := newComfyPlugin(t)
	firstFrame := "https://cdn.example/first.png"
	lastFrame := "https://cdn.example/last.png"
	reference := "https://cdn.example/reference.png"
	audio := "https://cdn.example/reference.wav"

	cases := []struct {
		name    string
		model   string
		action  string
		request map[string]any
		want    map[string]any
	}{
		{
			name:   "first and last frame",
			model:  "minimax_h3_b99_002",
			action: "first_tail_to_video",
			request: map[string]any{
				"prompt": "morph", "first_frame": firstFrame, "last_frame": lastFrame,
				"seconds": 6, "size": "720x1280",
			},
			want: map[string]any{
				"prompt": "morph", "duration": float64(6), "resolution": "736p竖",
				"first_frame": firstFrame, "last_frame": lastFrame,
			},
		},
		{
			name:   "reference images, audio and mode",
			model:  "minimax_h3_803",
			action: "reference_to_video",
			request: mergeValues(refImages(9), refAudios(3), map[string]any{
				"prompt": "dance", "seconds": 5, "size": "1280x720", "mode": "pro",
			}),
			want: mergeValues(refImages(9), refAudios(3), map[string]any{
				"prompt": "dance", "duration": float64(5), "resolution": "768p横(1376*768)", "mode": "pro",
			}),
		},
		{
			name:   "image and audio drive the length",
			model:  "minimax_h3_image_audio_to_video",
			action: "image_to_video",
			request: map[string]any{
				"ref_image_0": reference, "ref_audio_0": audio,
				"audio_duration": 8, "resolution": "1080p横",
			},
			want: map[string]any{
				"ref_image_0": reference, "ref_audio_0": audio,
				"audio_duration": float64(8), "resolution": "1080p横",
			},
		},
		{
			name:   "openai reference image reaches the first slot",
			model:  "minimax_h3_lightx2v_v5",
			action: "reference_to_video",
			request: map[string]any{
				"prompt": "walk", "input_reference": reference, "seconds": 6,
			},
			want: map[string]any{
				"prompt": "walk", "duration": float64(6), "resolution": "768p竖",
				"ref_image_0": reference,
			},
		},
		{
			name:   "motion retargeting takes media only",
			model:  comfyRetargetingModel,
			action: "image_to_video",
			request: map[string]any{
				"ref_image": reference, "ref_video": "https://cdn.example/motion.mp4", "prompt": "ignored",
			},
			want: map[string]any{
				"ref_image": reference, "ref_video": "https://cdn.example/motion.mp4",
				"resolution": "464*832px(竖版)",
			},
		},
		{
			// The graph has no seed input, so an OpenAI-style seed is dropped
			// instead of being forwarded.
			name:   "workflow without a seed input",
			model:  "minimax_h3_zm_nono",
			action: "image_to_video",
			request: map[string]any{
				"prompt": "sing", "seed": 42,
			},
			want: map[string]any{
				"prompt": "sing", "resolution": "768p竖",
			},
		},
		{
			// u22 takes up to nine images and three audios; upstream allows seed 0.
			name:   "u22 reference images and audio",
			model:  "minimax_h3_zm_u22",
			action: "image_to_video",
			request: mergeValues(refImages(2), refAudios(1), map[string]any{
				"prompt": "dance", "seconds": 6, "resolution": "480p横", "seed": 0,
			}),
			want: mergeValues(refImages(2), refAudios(1), map[string]any{
				"prompt": "dance", "duration": float64(6), "resolution": "480p横", "seed": float64(0),
			}),
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			decode := comfyDecode(t, plugin, testCase.model, testCase.request)
			assert.Equal(t, testCase.action, decode["action"])
			assert.Equal(t, testCase.want, decode["requestBody"])
		})
	}
}

func TestComfyUIRejectsOutOfRangeDuration(t *testing.T) {
	plugin := newComfyPlugin(t)
	for _, seconds := range []any{0, 20, 5.5} {
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"model":         comfyVideoModel,
			"upstreamModel": comfyVideoModel,
			"body": map[string]any{"kind": "json", "value": map[string]any{
				"model":   comfyVideoModel,
				"prompt":  "a cat",
				"seconds": seconds,
			}},
		})
		require.Error(t, err, seconds)
	}
}

// Each workflow caps its own duration, and the workflow that runs on a
// reference audio reads `audio_duration` instead.
func TestComfyUIDurationBoundsFollowWorkflow(t *testing.T) {
	plugin := newComfyPlugin(t)
	cases := []struct {
		model   string
		field   string
		seconds float64
		wantErr bool
	}{
		{"minimax_h3_image_audio_to_video_v2", "seconds", 10, false},
		{"minimax_h3_image_audio_to_video_v2", "seconds", 11, true},
		{"minimax_h3_b99_003_12s", "seconds", 15, false},
		{"minimax_h3_b99_003_12s", "seconds", 16, true},
		{"minimax_h3_805", "seconds", 16, true},
		{"minimax_h3_zm_u22", "seconds", 15, false},
		{"minimax_h3_zm_u22", "seconds", 16, true},
		{"minimax_h3_image_audio_to_video", "audio_duration", 11, false},
		{"minimax_h3_image_audio_to_video", "audio_duration", 16, true},
	}
	for _, testCase := range cases {
		value := map[string]any{"model": testCase.model, "prompt": "x", testCase.field: testCase.seconds}
		_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
			"model":         testCase.model,
			"upstreamModel": testCase.model,
			"body":          map[string]any{"kind": "json", "value": value},
		})
		if testCase.wantErr {
			require.Error(t, err, "%s %v", testCase.model, testCase.seconds)
		} else {
			require.NoError(t, err, "%s %v", testCase.model, testCase.seconds)
		}
	}
}

func TestComfyUIRequiresWorkflowInputs(t *testing.T) {
	plugin := newComfyPlugin(t)
	reference := "https://cdn.example/reference.png"
	audio := "https://cdn.example/reference.wav"
	submit := func(model string, body map[string]any) error {
		_, err := plugin.Engine.Call(t.Context(), "buildSubmitRequest", map[string]any{
			"baseUrl":       "https://autodl.art",
			"apiKey":        "token-under-test",
			"model":         model,
			"upstreamModel": model,
			"requestBody":   body,
		})
		return err
	}

	require.Error(t, submit("minimax_h3_b99_002", map[string]any{"prompt": "x", "first_frame": reference}), "last_frame")
	require.Error(t, submit("minimax_h3_801", map[string]any{"prompt": "x"}), "ref_image_0")
	require.Error(t, submit("minimax_h3_zm_u22", map[string]any{"prompt": "x"}), "ref_image_0")
	require.Error(t, submit("minimax_h3_z0903", map[string]any{"prompt": "x", "ref_image_0": reference}), "ref_audio_0")
	require.Error(t, submit("minimax_h3_image_audio_to_video", map[string]any{"ref_image_0": reference}), "ref_audio_0")
	require.Error(t, submit(comfyRetargetingModel, map[string]any{"ref_image": reference}), "ref_video")
	// 803 only requires the prompt; its reference images are optional.
	require.NoError(t, submit("minimax_h3_803", map[string]any{"prompt": "x"}))
	require.NoError(t, submit("minimax_h3_image_audio_to_video", map[string]any{
		"ref_image_0": reference, "ref_audio_0": audio,
	}))
}

// AutoDL resolution labels spell out the frame size, but prices only vary by
// tier, so the billing facts carry the tier.
func TestComfyUIResolutionFactsUseTiers(t *testing.T) {
	plugin := newComfyPlugin(t)

	decode := comfyDecode(t, plugin, "minimax_h3_801", map[string]any{"prompt": "x", "resolution": "1080p竖"})
	body := decode["requestBody"].(map[string]any)
	assert.Equal(t, "1088p竖(1088*1920)", body["resolution"], "the nearest supported tier is sent")
	assert.Equal(t, map[string]any{"seconds": float64(5), "resolution": "1088p", "media_inputs": float64(0)}, comfyUsage(t, plugin, "minimax_h3_801", body))

	defaulted := comfyDecode(t, plugin, "minimax_h3_801", map[string]any{"prompt": "x"})
	defaultBody := defaulted["requestBody"].(map[string]any)
	assert.Equal(t, "768p竖(768*1376)", defaultBody["resolution"])
	assert.Equal(t, "768p", comfyUsage(t, plugin, "minimax_h3_801", defaultBody)["resolution"])

	square := comfyDecode(t, plugin, "minimax_h3_lightx2v_v5_15s", map[string]any{"prompt": "x", "size": "768x768"})
	assert.Equal(t, "768p(1:1)", square["requestBody"].(map[string]any)["resolution"])

	sized := comfyDecode(t, plugin, "minimax_h3_b99_001", map[string]any{"prompt": "x", "size": "720x1280"})
	assert.Equal(t, "736p竖", sized["requestBody"].(map[string]any)["resolution"])

	_, err := plugin.Engine.CallPath(t.Context(), "protocols", []string{"openai_video", "decodeRequest"}, map[string]any{
		"model":         "minimax_h3_801",
		"upstreamModel": "minimax_h3_801",
		"body": map[string]any{"kind": "json", "value": map[string]any{
			"model": "minimax_h3_801", "prompt": "x", "resolution": "banana",
		}},
	})
	require.Error(t, err, "an unknown resolution is rejected")
}

func TestComfyUITaskResultStatusMapping(t *testing.T) {
	plugin := newComfyPlugin(t)
	cases := []struct {
		name       string
		body       map[string]any
		wantStatus string
		wantURL    string
	}{
		{"queued", map[string]any{"code": "Success", "data": map[string]any{"status": "QUEUED"}}, "QUEUED", ""},
		{
			// The vendor reports a lowercase "completed" with a results array.
			"completed",
			map[string]any{"msg": "", "code": "Success", "data": map[string]any{
				"status": "completed",
				"results": []any{map[string]any{
					"url": "https://cdn.example/out.mp4", "type": "video", "file_type": "mp4", "output_type": "output",
				}},
				"task_id":   "671ce5ca-80b3-4a18-8b5c-af6013f0f03d",
				"client_id": "158a0bba46b6a42f9b175ecdeaea2ac4",
			}},
			"SUCCESS", "https://cdn.example/out.mp4",
		},
		{"running", map[string]any{"code": "Success", "data": map[string]any{"status": "RUNNING"}}, "IN_PROGRESS", ""},
		{
			"success",
			map[string]any{"code": "Success", "data": map[string]any{"status": "SUCCESS", "results": []any{
				map[string]any{"url": "https://cdn.example/out.mp4", "type": "video"},
			}}},
			"SUCCESS", "https://cdn.example/out.mp4",
		},
		{"failed", map[string]any{"code": "Success", "data": map[string]any{"status": "FAILED", "message": "boom"}}, "FAILURE", ""},
		{"vendor error", map[string]any{"code": "InternalError", "data": nil, "msg": "工作流不可用"}, "UNKNOWN", ""},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			result := callComfy(t, plugin, []string{"parseTaskResult"}, map[string]any{"taskId": "upstream-1"}, testCase.body)
			assert.Equal(t, testCase.wantStatus, result["status"])
			if testCase.wantURL != "" {
				assert.Equal(t, testCase.wantURL, result["url"])
			}
			if testCase.wantStatus == "FAILURE" {
				assert.Equal(t, "boom", result["reason"])
			}
		})
	}
}

func TestComfyUIArtifactsAreCredentialless(t *testing.T) {
	plugin := newComfyPlugin(t)
	// The task stores the vendor's whole poll response, with results nested
	// under its own data member.
	taskData := map[string]any{
		"code": "Success",
		"data": map[string]any{"status": "SUCCESS", "results": []any{
			map[string]any{"url": "https://cdn.example/out.mp4", "type": "video"},
			map[string]any{"url": "https://cdn.example/voice.wav", "type": "audio"},
		}},
	}
	ctx := map[string]any{
		"status":        "SUCCESS",
		"data":          taskData,
		"artifactKey":   "media_1",
		"clientRequest": map[string]any{"method": "GET"},
	}

	artifacts, err := plugin.Engine.Call(t.Context(), "listArtifacts", ctx)
	require.NoError(t, err)
	encoded, err := common.Marshal(artifacts)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"key":"media","type":"video"},{"key":"media_1","type":"audio"}]`, string(encoded))

	content := callComfy(t, plugin, []string{"buildContentRequest"}, ctx)
	assert.Equal(t, "https://cdn.example/voice.wav", content["url"])
	assert.Equal(t, "GET", content["method"])
	assert.Equal(t, true, content["credentialless"])

	// The storage host rejects HEAD on its signed URLs.
	headCtx := map[string]any{
		"status":        "SUCCESS",
		"data":          ctx["data"],
		"artifactKey":   "media",
		"clientRequest": map[string]any{"method": "HEAD"},
	}
	assert.Equal(t, "GET", callComfy(t, plugin, []string{"buildContentRequest"}, headCtx)["method"])
}

func TestComfyUIUsageFacts(t *testing.T) {
	plugin := newComfyPlugin(t)

	video := comfyUsage(t, plugin, comfyVideoModel, map[string]any{
		"prompt": "a cat", "duration": 6, "resolution": "480p竖",
	})
	assert.Equal(t, map[string]any{"seconds": float64(6), "resolution": "480p", "media_inputs": float64(0)}, video)

	// Every image, audio, and video the client supplies costs one media input,
	// including the first one.
	withMedia := mergeValues(refImages(2), refAudios(1), map[string]any{
		"prompt": "dance", "duration": 5, "resolution": "768p横(1376*768)",
	})
	released := comfyUsage(t, plugin, "minimax_h3_803", withMedia)
	assert.Equal(t, map[string]any{"seconds": float64(5), "resolution": "768p", "media_inputs": float64(3)}, released)

	// u22 accepts up to nine reference images and three reference audios.
	u22 := comfyUsage(t, plugin, "minimax_h3_zm_u22", mergeValues(refImages(2), refAudios(1), map[string]any{
		"prompt": "dance", "duration": 6, "resolution": "480p横",
	}))
	assert.Equal(t, map[string]any{"seconds": float64(6), "resolution": "480p", "media_inputs": float64(3)}, u22)

	// The OpenAI reference image becomes the workflow's first image input, so
	// it counts once.
	mapped := comfyDecode(t, plugin, "minimax_h3_lightx2v_v5", map[string]any{
		"prompt": "walk", "input_reference": "https://cdn.example/reference.png",
	})
	mappedFacts := comfyUsage(t, plugin, "minimax_h3_lightx2v_v5", mapped["requestBody"].(map[string]any))
	assert.Equal(t, float64(1), mappedFacts["media_inputs"])

	// Empty optional media inputs are not sent upstream and are not charged.
	empty := comfyUsage(t, plugin, "minimax_h3_803", map[string]any{
		"prompt": "dance", "resolution": "768p竖", "ref_audio_0": "", "ref_image_0": "  ",
	})
	assert.Equal(t, float64(0), empty["media_inputs"])

	// Retargeting sends an image and a video.
	retargeting := comfyUsage(t, plugin, comfyRetargetingModel, map[string]any{
		"ref_image": "https://cdn.example/reference.png",
		"ref_video": "https://cdn.example/motion.mp4",
	})
	assert.Equal(t, float64(2), retargeting["media_inputs"])

	// Speech is reserved by an estimate of the spoken length, since AutoDL
	// reports the audio duration only in the finished file. Its voice
	// reference is a media input.
	tts := comfyUsage(t, plugin, comfyTTSModel, map[string]any{
		"prompt_text": "一二三四五六七八九", "prompt_simple": "https://cdn.example/ref.wav",
	})
	assert.Equal(t, map[string]any{"seconds": float64(2), "media_inputs": float64(1)}, tts)

	ttsEmotion := comfyUsage(t, plugin, comfyTTSModel, map[string]any{
		"prompt_text":   "一二三四五六七八九",
		"prompt_simple": "https://cdn.example/ref.wav",
		"emo_ref_audio": "https://cdn.example/emotion.wav",
	})
	assert.Equal(t, map[string]any{"seconds": float64(2), "media_inputs": float64(2)}, ttsEmotion)
}

// Retargeting follows the reference video, so it reserves its longest clip and
// settles on the length of the finished file.
func TestComfyUIRetargetingSettlesOnMeasuredVideo(t *testing.T) {
	plugin := newComfyPlugin(t)

	reserved := comfyUsage(t, plugin, comfyRetargetingModel, map[string]any{
		"ref_image": "https://cdn.example/reference.png",
		"ref_video": "https://cdn.example/motion.mp4",
	})
	assert.Equal(t, map[string]any{"seconds": float64(15), "media_inputs": float64(2)}, reserved)

	facts := callComfy(t, plugin, []string{"extractUsageOnComplete"}, map[string]any{
		"model":         comfyRetargetingModel,
		"upstreamModel": comfyRetargetingModel,
	}, map[string]any{"plugin_state": map[string]any{"video_seconds": 9.5}})
	assert.Equal(t, map[string]any{"seconds": 9.5}, facts)

	// Workflows whose length AutoDL takes from the request keep the frozen
	// facts instead of settling again.
	value, err := plugin.Engine.Call(t.Context(), "extractUsageOnComplete",
		map[string]any{"model": comfyVideoModel, "upstreamModel": comfyVideoModel},
		map[string]any{"plugin_state": map[string]any{"video_seconds": 9.5}},
	)
	require.NoError(t, err)
	assert.Nil(t, value)
}

func TestComfyUISpeechSettlesOnMeasuredDuration(t *testing.T) {
	plugin := newComfyPlugin(t)

	facts := callComfy(t, plugin, []string{"extractUsageOnComplete"}, map[string]any{
		"model":         comfyTTSModel,
		"upstreamModel": comfyTTSModel,
	}, map[string]any{"plugin_state": map[string]any{"audio_seconds": 7.25}})
	assert.Equal(t, map[string]any{"seconds": 7.25}, facts)

	// A poll that could not read the file leaves the reserved estimate alone.
	value, err := plugin.Engine.Call(t.Context(), "extractUsageOnComplete",
		map[string]any{"model": comfyTTSModel, "upstreamModel": comfyTTSModel},
		map[string]any{"plugin_state": map[string]any{}},
	)
	require.NoError(t, err)
	assert.Nil(t, value, "no measurement yields no override")
}

// comfyMp4 builds a minimal MP4 whose mvhd reports the given duration. The
// returned variants put moov first (faststart) and last (the usual layout).
func comfyMp4(durationMilliseconds uint32) (faststart, moovLast, moovFree []byte) {
	ftyp := make([]byte, 16)
	binary.BigEndian.PutUint32(ftyp[0:], 16)
	copy(ftyp[4:], "ftyp")
	copy(ftyp[8:], "isom")

	mdat := make([]byte, 8)
	binary.BigEndian.PutUint32(mdat[0:], 8)
	copy(mdat[4:], "mdat")

	// mvhd v0: box header, version/flags, creation, modification, timescale,
	// duration, then the remaining fields as zeros.
	mvhd := make([]byte, 108)
	binary.BigEndian.PutUint32(mvhd[0:], 108)
	copy(mvhd[4:], "mvhd")
	binary.BigEndian.PutUint32(mvhd[20:], 1000)
	binary.BigEndian.PutUint32(mvhd[24:], durationMilliseconds)

	moov := make([]byte, 8+len(mvhd))
	binary.BigEndian.PutUint32(moov[0:], uint32(len(moov)))
	copy(moov[4:], "moov")
	copy(moov[8:], mvhd)

	faststart = append(append(append([]byte{}, moov...), mdat...), ftyp...)
	moovLast = append(append(append([]byte{}, ftyp...), mdat...), moov...)
	moovFree = append(append([]byte{}, ftyp...), mdat...)
	return faststart, moovLast, moovFree
}

// comfyWav builds a minimal PCM WAV whose data chunk lasts the given seconds.
func comfyWav(seconds uint32) []byte {
	const byteRate = 16000
	wav := make([]byte, 0, 44)
	wav = append(wav, 'R', 'I', 'F', 'F')
	wav = binary.LittleEndian.AppendUint32(wav, 36+seconds*byteRate)
	wav = append(wav, 'W', 'A', 'V', 'E', 'f', 'm', 't', ' ')
	wav = binary.LittleEndian.AppendUint32(wav, 16)
	wav = binary.LittleEndian.AppendUint16(wav, 1)
	wav = binary.LittleEndian.AppendUint16(wav, 1)
	wav = binary.LittleEndian.AppendUint32(wav, 8000)
	wav = binary.LittleEndian.AppendUint32(wav, byteRate)
	wav = binary.LittleEndian.AppendUint16(wav, 2)
	wav = binary.LittleEndian.AppendUint16(wav, 16)
	wav = append(wav, 'd', 'a', 't', 'a')
	wav = binary.LittleEndian.AppendUint32(wav, seconds*byteRate)
	return append(wav, make([]byte, seconds*byteRate)...)
}

// parseComfyWithMedia runs parseTaskResult against a fake storage host that
// answers suffix reads with tail and everything else with head.
func parseComfyWithMedia(t *testing.T, plugin *jsplugin.LoadedPlugin, model, mediaType string, tail, head []byte) map[string]any {
	t.Helper()
	fetcher := func(_ context.Context, request jsplugin.FetchRequest) (jsplugin.FetchResponse, error) {
		body := head
		if strings.HasPrefix(request.Headers["Range"], "bytes=-") {
			body = tail
		}
		return jsplugin.FetchResponse{Status: 206, Body: body}, nil
	}
	value, err := plugin.Engine.Call(jsplugin.WithFetcher(t.Context(), fetcher), "parseTaskResult",
		map[string]any{"model": model, "upstreamModel": model},
		map[string]any{"code": "Success", "data": map[string]any{"status": "SUCCESS", "results": []any{
			map[string]any{"url": "https://cdn.example/out", "type": mediaType},
		}}},
	)
	require.NoError(t, err)
	encoded, err := common.Marshal(value)
	require.NoError(t, err)
	var result map[string]any
	require.NoError(t, common.Unmarshal(encoded, &result))
	return result
}

// The measured durations come from the output file itself, so the box parsing
// has to survive both MP4 layouts and WAV's mixed endianness.
func TestComfyUIMeasuresMediaDuration(t *testing.T) {
	plugin := newComfyPlugin(t)
	faststart, moovLast, moovFree := comfyMp4(5700)

	t.Run("mp4 with moov at the end", func(t *testing.T) {
		state, ok := parseComfyWithMedia(t, plugin, comfyRetargetingModel, "video", moovLast, nil)["state"].(map[string]any)
		require.True(t, ok)
		assert.InDelta(t, 5.7, state["video_seconds"], 1e-9)
	})

	t.Run("mp4 with moov first", func(t *testing.T) {
		state, ok := parseComfyWithMedia(t, plugin, comfyRetargetingModel, "video", moovFree, faststart)["state"].(map[string]any)
		require.True(t, ok, "the suffix read has no moov, so the head is probed")
		assert.InDelta(t, 5.7, state["video_seconds"], 1e-9)
	})

	t.Run("wav header", func(t *testing.T) {
		state, ok := parseComfyWithMedia(t, plugin, comfyTTSModel, "audio", nil, comfyWav(2))["state"].(map[string]any)
		require.True(t, ok)
		assert.InDelta(t, 2.0, state["audio_seconds"], 1e-9)
	})

	t.Run("unreadable media", func(t *testing.T) {
		result := parseComfyWithMedia(t, plugin, comfyTTSModel, "audio", nil, nil)
		assert.Nil(t, result["state"], "no measurement yields no override")
	})
}

func TestComfyUIBillsOnlyMeteredUsage(t *testing.T) {
	plugin := newComfyPlugin(t)
	assert.True(t, plugin.Meta.NoConstantCharge)
	schema, _ := plugin.Meta.UsageForModel(comfyVideoModel)
	assert.Equal(t, "second", schema["seconds"].Unit)
	assert.Equal(t, "count", schema["media_inputs"].Unit)
}

func TestComfyUIu22UsesWorkflowSubmitAndResultUrls(t *testing.T) {
	plugin := newComfyPlugin(t)
	const model = "minimax_h3_zm_u22"
	submit := callComfy(t, plugin, []string{"buildSubmitRequest"}, map[string]any{
		"baseUrl":       "https://autodl.art",
		"apiKey":        "token-under-test",
		"model":         model,
		"upstreamModel": model,
		"requestBody":   map[string]any{"prompt": "x", "ref_image_0": "https://cdn.example/ref.png"},
	})
	assert.Equal(t, "https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_zm_u22", submit["url"])
	assert.Equal(t, "POST", submit["method"])

	query := callComfy(t, plugin, []string{"buildQueryRequest"}, map[string]any{
		"baseUrl": "https://autodl.art",
		"apiKey":  "token-under-test",
		"taskId":  "671ce5ca-80b3-4a18-8b5c-af6013f0f03d",
	})
	assert.Equal(t, "https://autodl.art/api/v1/comfyui/comfyui_workflow/result/671ce5ca-80b3-4a18-8b5c-af6013f0f03d", query["url"])
	assert.Equal(t, "GET", query["method"])
}
