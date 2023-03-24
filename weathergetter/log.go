package weathergetter

import (
	"encoding/json"
	"log"
)

// Entry defines a log entry.
type LogEntry struct {
	Message   string `json:"message"`
	Severity  string `json:"severity,omitempty"`
	Component string `json:"component,omitempty"`
}

// String renders an entry structure to the JSON format expected by Cloud Logging.
func (e LogEntry) String() string {
	if e.Severity == "" {
		e.Severity = "INFO"
	}
	if e.Component == "" {
		e.Component = "weathergetter"
	}
	out, err := json.Marshal(e)
	if err != nil {
		log.Printf("json.Marshal: %v", err)
	}
	return string(out)
}
