package transformer

import (
	"context"

	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
)

func init() {
	functions.CloudEvent("Transform", Transform)
}

func Transform(ctx context.Context, e cloudevents.Event) error {
	// Do something with event.Context and event.Data (via event.DataAs(foo)).
	return nil
}
