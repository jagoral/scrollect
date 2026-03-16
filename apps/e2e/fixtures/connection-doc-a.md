# Distributed Consensus

## The Raft Algorithm

Raft is a consensus algorithm designed for understandability. It separates leader election from log replication. A leader is elected to manage the replicated log, accepting client requests and replicating entries to follower nodes.

## Consistency vs Availability

Distributed systems face a fundamental tradeoff between consistency and availability. The CAP theorem states that in the presence of a network partition, a system must choose between providing consistent reads or remaining available to serve requests.
