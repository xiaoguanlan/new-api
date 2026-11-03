package operation_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// 只有显式列出的模型才走「完成后再扣」，且模型名必须精确匹配，
// 避免 indextts2-v1 这类名字误伤 indextts2-v1-preview 之类的变体。
func TestIsPostPaidTaskModel(t *testing.T) {
	orig := quotaSetting.PostPaidTaskModels
	t.Cleanup(func() { quotaSetting.PostPaidTaskModels = orig })

	quotaSetting.PostPaidTaskModels = " indextts2-v1 , other-model ,,"

	assert.True(t, IsPostPaidTaskModel("indextts2-v1"))
	assert.True(t, IsPostPaidTaskModel("other-model"))
	assert.False(t, IsPostPaidTaskModel("indextts2-v1-preview"))
	assert.False(t, IsPostPaidTaskModel("minimax_h3_801"))
	assert.False(t, IsPostPaidTaskModel(""))

	quotaSetting.PostPaidTaskModels = ""
	assert.False(t, IsPostPaidTaskModel("indextts2-v1"), "an empty setting keeps the existing pre-consume behaviour")
}
