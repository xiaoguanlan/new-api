package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// 易支付标准订单查询接口：
// GET {支付地址}/api.php?act=order&pid={商户ID}&key={商户密钥}&out_trade_no={商户订单号}
// 回调验签只能证明参数来自持有商户密钥的一方；结算前再查询一次网关，
// 可以拦住密钥泄露后伪造的回调、网关误发/提前发送的成功通知。
const epayOrderQueryTimeout = 5 * time.Second

// epayOrderQueryClient 单独维护查询客户端，测试可替换。
var epayOrderQueryClient = &http.Client{Timeout: epayOrderQueryTimeout}

type epayOrderQueryResponse struct {
	Code        int    `json:"code"`
	Msg         string `json:"msg"`
	TradeNo     string `json:"trade_no"`
	OutTradeNo  string `json:"out_trade_no"`
	Money       string `json:"money"`
	TradeStatus string `json:"trade_status"`
}

func queryEpayOrder(ctx context.Context, tradeNo string) (*epayOrderQueryResponse, error) {
	baseUrl, err := url.Parse(operation_setting.PayAddress)
	if err != nil {
		return nil, err
	}
	baseUrl.Path = path.Join(baseUrl.Path, "/api.php")
	query := baseUrl.Query()
	query.Set("act", "order")
	query.Set("pid", operation_setting.EpayId)
	query.Set("key", operation_setting.EpayKey)
	query.Set("out_trade_no", tradeNo)
	baseUrl.RawQuery = query.Encode()

	ctx, cancel := context.WithTimeout(ctx, epayOrderQueryTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, baseUrl.String(), nil)
	if err != nil {
		return nil, err
	}
	response, err := epayOrderQueryClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	if err != nil {
		return nil, err
	}
	var result epayOrderQueryResponse
	if err := common.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// confirmEpayOrderPaid 在回调验签通过后，再向支付网关查询一次订单状态。
// 不同易支付网关对查询接口的实现不一致：查询失败、响应无法识别时沿用原行为
// （信任已验签的回调），只有网关明确返回未支付或已关闭状态时才拒绝执行业务。
func confirmEpayOrderPaid(ctx context.Context, tradeNo string) bool {
	result, err := queryEpayOrder(ctx, tradeNo)
	if err != nil {
		logger.LogWarn(ctx, common.LogText("Epay order query failed, using signed callback trade_no=%s error=%q", tradeNo, err.Error()))
		return true
	}
	if result.Code != 1 || (result.OutTradeNo != "" && result.OutTradeNo != tradeNo) {
		logger.LogWarn(ctx, common.LogText("Epay order query returned an unrecognized response, using signed callback trade_no=%s response=%s", tradeNo, common.GetJsonString(result)))
		return true
	}
	switch strings.ToUpper(result.TradeStatus) {
	case "TRADE_SUCCESS", "TRADE_FINISHED":
		logger.LogInfo(ctx, common.LogText("Epay order query confirmed payment trade_no=%s trade_status=%s", tradeNo, result.TradeStatus))
		return true
	case "WAIT_BUYER_PAY", "TRADE_CLOSED":
		logger.LogWarn(ctx, common.LogText("Epay order query shows the order is not paid trade_no=%s trade_status=%s", tradeNo, result.TradeStatus))
		return false
	default:
		logger.LogWarn(ctx, common.LogText("Epay order query returned an unknown status, using signed callback trade_no=%s trade_status=%q", tradeNo, result.TradeStatus))
		return true
	}
}
