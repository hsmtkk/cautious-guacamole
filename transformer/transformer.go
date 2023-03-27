package transformer

import (
	"context"
	"fmt"
	"log"
	"os"

	"cloud.google.com/go/pubsub"
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
	publishID, err := publish(ctx, transformed)
	if err != nil {
		log.Print(LogEntry{Severity: "ERROR", Message: err.Error()})
		return err
	}
	log.Print(LogEntry{Message: fmt.Sprintf("message published; %s", publishID)})
	log.Print(LogEntry{Message: "end"})
	return nil
}

func transform(orig []byte) ([]byte, error) {
	return orig, nil
}

func publish(ctx context.Context, data []byte) (string, error) {
	log.Print(LogEntry{Message: "project ID: " + os.Getenv("PROJECT_ID"), Severity: "DEBUG"})
	log.Print(LogEntry{Message: "topic: " + os.Getenv("BIG_QUERY_QUEUE"), Severity: "DEBUG"})
	client, err := pubsub.NewClient(ctx, os.Getenv("PROJECT_ID"))
	if err != nil {
		return "", fmt.Errorf("failed to make Pub/Sub client; %w", err)
	}
	defer client.Close()
	topic := client.Topic(os.Getenv("BIG_QUERY_QUEUE"))
	result := topic.Publish(ctx, &pubsub.Message{
		Data: data,
	})
	id, err := result.Get(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to publish; %w", err)
	}
	return id, nil
}
