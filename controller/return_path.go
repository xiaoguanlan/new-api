package controller

import (
	"os"
	"strings"

	"github.com/QuantumNous/new-api/setting/system_setting"
)

// paymentReturnPath builds the browser redirect target used after a payment.
// The dashboard is often served from a different origin than the API server
// (for example dashboard.example.com vs api.example.com). A browser session
// does not follow the redirect across origins, so returning to the API origin
// lands the user on a login page. Prefer FRONTEND_BASE_URL, which already
// describes the dashboard origin, and fall back to ServerAddress.
func paymentReturnPath(suffix string) string {
	base := strings.TrimSpace(os.Getenv("FRONTEND_BASE_URL"))
	if base == "" {
		base = system_setting.ServerAddress
	}
	return strings.TrimRight(base, "/") + suffix
}
