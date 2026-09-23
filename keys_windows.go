//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

func protectBytes(src []byte) ([]byte, error) {
	if len(src) == 0 {
		return []byte{}, nil
	}
	in := windows.DataBlob{Size: uint32(len(src)), Data: &src[0]}
	var out windows.DataBlob
	if err := windows.CryptProtectData(&in, nil, nil, 0, nil, 0, &out); err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	result := make([]byte, out.Size)
	copy(result, unsafe.Slice(out.Data, out.Size))
	return result, nil
}
func unprotectBytes(src []byte) ([]byte, error) {
	if len(src) == 0 {
		return []byte{}, nil
	}
	in := windows.DataBlob{Size: uint32(len(src)), Data: &src[0]}
	var out windows.DataBlob
	if err := windows.CryptUnprotectData(&in, nil, nil, 0, nil, 0, &out); err != nil {
		return nil, err
	}
	defer windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	result := make([]byte, out.Size)
	copy(result, unsafe.Slice(out.Data, out.Size))
	return result, nil
}
func loadProtectedKeys(path string) (map[string]string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	plain, err := unprotectBytes(b)
	if err != nil {
		var legacy map[string]string
		if json.Unmarshal(b, &legacy) == nil {
			return legacy, nil
		}
		return nil, fmt.Errorf("decrypt keys: %w", err)
	}
	var keys map[string]string
	err = json.Unmarshal(plain, &keys)
	return keys, err
}
func saveProtectedKeys(path string, keys map[string]string) error {
	plain, err := json.Marshal(keys)
	if err != nil {
		return err
	}
	sealed, err := protectBytes(plain)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err = os.WriteFile(tmp, sealed, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
