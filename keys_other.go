//go:build !windows

package main

import (
	"encoding/json"
	"os"
)

func loadProtectedKeys(path string) (map[string]string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var keys map[string]string
	err = json.Unmarshal(b, &keys)
	return keys, err
}
func saveProtectedKeys(path string, keys map[string]string) error {
	b, err := json.Marshal(keys)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err = os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
