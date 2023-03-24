package weathergetter

import (
	"net/http"

	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
)

func init() {
	functions.HTTP("GetWeather", GetWeather)
}

func GetWeather(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("Hello, World!"))
}