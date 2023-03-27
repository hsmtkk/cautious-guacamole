package weathergetter

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"cloud.google.com/go/pubsub"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
)

func init() {
	functions.HTTP("GetWeather", GetWeather)
}

func GetWeather(w http.ResponseWriter, r *http.Request) {
	log.Print(LogEntry{Message: "begin"})
	ctx := r.Context()
	cities := strings.Split(os.Getenv("CITIES"), ",")
	for _, city := range cities {
		if err := getWeather(ctx, city); err != nil {
			log.Print(LogEntry{Severity: "ERROR", Message: err.Error()})
		}
	}
	w.WriteHeader(http.StatusOK)
	log.Print(LogEntry{Message: "end"})
}

func getWeather(ctx context.Context, city string) error {
	respBytes, err := get(ctx, city)
	if err != nil {
		return err
	}
	log.Print(LogEntry{Message: string(respBytes)})
	if err := publish(ctx, respBytes); err != nil {
		return err
	}
	return nil
}

func get(ctx context.Context, city string) ([]byte, error) {
	openWeatherAPIKey := os.Getenv("OPEN_WEATHER_API_KEY")
	url := fmt.Sprintf("https://api.openweathermap.org/data/2.5/weather?q=%s&appid=%s", city, openWeatherAPIKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to make new HTTP request; %w", err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send HTTP GET: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return nil, fmt.Errorf("got HTTP error code; %d; %s", resp.StatusCode, resp.Status)
	}
	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read HTTP response; %w", err)
	}
	return respBytes, nil
}

func publish(ctx context.Context, data []byte) error {
	client, err := pubsub.NewClient(ctx, os.Getenv("PROJECT_ID"))
	if err != nil {
		return fmt.Errorf("failed to make Pub/Sub client; %w", err)
	}
	defer client.Close()
	topic := client.Topic(os.Getenv("TRANSFORMER_QUEUE"))
	result := topic.Publish(ctx, &pubsub.Message{
		Data: data,
	})
	publishID, err := result.Get(ctx)
	if err != nil {
		return fmt.Errorf("failed to publish; %w", err)
	}
	log.Print(LogEntry{Message: fmt.Sprintf("message published; %s", publishID)})
	return nil
}
