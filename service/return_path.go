package service

import (
	"os"
	"strings"

	"github.com/QuantumNous/new-api/setting/system_setting"
)

// PaymentReturnURL builds a dashboard link for the user. The dashboard may be
// served from a different origin than the API server, so prefer
// FRONTEND_BASE_URL and fall back to ServerAddress.
func PaymentReturnURL(suffix string) string {
	base := strings.TrimSpace(os.Getenv("FRONTEND_BASE_URL"))
	if base == "" {
		base = system_setting.ServerAddress
	}
	return strings.TrimRight(base, "/") + suffix
}
