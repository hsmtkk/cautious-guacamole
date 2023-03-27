package transformer

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"cloud.google.com/go/bigquery"
	"github.com/GoogleCloudPlatform/functions-framework-go/functions"
	cloudevents "github.com/cloudevents/sdk-go/v2"
)

func init() {
	functions.CloudEvent("Transform", Transform)
}

type messagePublishedData struct {
	Message pubSubMessage
}

type pubSubMessage struct {
	Data []byte `json:"data"`
}

type originalWeatherData struct {
	Coordinates originalWeatherDataCoord     `json:"coord"`
	Weather     []originalWeatherDataWeather `json:"weather"`
	Main        originalWeatherDataMain      `json:"main"`
	Name        string                       `json:"name"`
}

type originalWeatherDataCoord struct {
	Longitude float64 `json:"lon"`
	Latitude  float64 `json:"lat"`
}

type originalWeatherDataWeather struct {
	ID          int    `json:"id"`
	Main        string `json:"main"`
	Description string `json:"description"`
	Icon        string `json:"string"`
}

type originalWeatherDataMain struct {
	Temperature    float64 `json:"temp"`
	TemperatureMin float64 `json:"temp_min"`
	TemperatureMax float64 `json:"temp_max"`
	Pressure       int     `json:"pressure"`
	Humidity       int     `json:"humidity"`
}

type transformedWeatherData struct {
	Longitude          float64 `bigquery:"longitude"`
	Latitude           float64 `bigquery:"latitude"`
	WeatherMain        string  `bigquery:"weather_main"`
	WeatherDescription string  `bigquery:"weather_description"`
	Temperature        float64 `bigquery:"temperature"`
	TemperatureMin     float64 `bigquery:"temperature_min"`
	TemperatureMax     float64 `bigquery:"temperature_max"`
	Pressure           int     `bigquery:"pressure"`
	Humidity           int     `bigquery:"humidity"`
	Name               string  `bigquery:"name"`
}

func Transform(ctx context.Context, e cloudevents.Event) error {
	log.Print(LogEntry{Message: "begin"})
	msg := messagePublishedData{}
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

func transform(origBytes []byte) (transformedWeatherData, error) {
	orig := originalWeatherData{}
	if err := json.Unmarshal(origBytes, &orig); err != nil {
		return transformedWeatherData{}, fmt.Errorf("failed to unmarshal JSON; %w", err)
	}
	return transformedWeatherData{
		Longitude:          orig.Coordinates.Longitude,
		Latitude:           orig.Coordinates.Latitude,
		WeatherMain:        orig.Weather[0].Main,
		WeatherDescription: orig.Weather[0].Description,
		Temperature:        orig.Main.Temperature,
		TemperatureMin:     orig.Main.TemperatureMin,
		TemperatureMax:     orig.Main.TemperatureMax,
		Pressure:           orig.Main.Pressure,
		Humidity:           orig.Main.Pressure,
		Name:               orig.Name,
	}, nil
}

func insert(ctx context.Context, data transformedWeatherData) error {
	client, err := bigquery.NewClient(ctx, os.Getenv("PROJECT_ID"))
	if err != nil {
		return fmt.Errorf("failed to make BigQuery client; %w", err)
	}
	table := client.Dataset(os.Getenv("BIG_QUERY_DATASET")).Table(os.Getenv("BIG_QUERY_TABLE"))
	inserter := table.Inserter()
	if err := inserter.Put(ctx, data); err != nil {
		return fmt.Errorf("failed to insert BigQuery; %w", err)
	}
	return nil
}
