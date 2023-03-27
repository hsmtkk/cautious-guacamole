package transformer

import (
	"context"
	"fmt"
	"log"

	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
)

func init() {
	functions.CloudEvent("Transform", Transform)
}

type MessagePublishedData struct {
	Message PubSubMessage
}

type PubSubMessage struct {
	Data []byte `json:"data"`
}

type WeatherData struct{}

func Transform(ctx context.Context, e cloudevents.Event) error {
	log.Print(LogEntry{Message: "begin"})
	msg := MessagePublishedData{}
	if err := e.DataAs(&msg); err != nil {
		log.Print(LogEntry{Severity: "ERROR", Message: err.Error()})
		return fmt.Errorf("failed to decode event; %w", err)
	}
	transformed, err := transform(msg.Message.Data)
	if err != nil {
		log.Print(LogEntry{Severity: "ERROR", Message: err.Error()})
		return err
	}
	if err := insert(ctx, transformed); err != nil {
		log.Print(LogEntry{Severity: "ERROR", Message: err.Error()})
		return err
	}
	log.Print(LogEntry{Message: "end"})
	return nil
}

func transform(orig []byte) (WeatherData, error) {
	log.Print(LogEntry{Severity: "DEBUG", Message: string(orig)})
	return WeatherData{}, nil
}

func insert(ctx context.Context, data WeatherData) error {
	return nil
}
