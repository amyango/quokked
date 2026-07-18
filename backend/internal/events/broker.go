// Package events implements a minimal in-process pub/sub broker for
// pushing server-sent-event notifications to connected browsers.
package events

import "sync"

// Broker fans out Publish calls to every currently-subscribed channel.
type Broker struct {
	mu      sync.Mutex
	clients map[chan string]struct{}
}

func NewBroker() *Broker {
	return &Broker{clients: make(map[chan string]struct{})}
}

// Subscribe registers a new client and returns its channel. The buffer
// lets a client miss a couple of pings without blocking Publish.
func (b *Broker) Subscribe() chan string {
	ch := make(chan string, 8)
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

// Unsubscribe removes a client. The channel is deliberately not closed —
// a concurrent Publish could still be sending to it, and closing would
// race with that send.
func (b *Broker) Unsubscribe(ch chan string) {
	b.mu.Lock()
	delete(b.clients, ch)
	b.mu.Unlock()
}

// Publish sends msg to every subscribed client, dropping it for any
// client whose buffer is full rather than blocking.
func (b *Broker) Publish(msg string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for ch := range b.clients {
		select {
		case ch <- msg:
		default:
		}
	}
}
