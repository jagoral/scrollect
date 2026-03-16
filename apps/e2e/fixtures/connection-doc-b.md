# System Design Patterns

## CAP Theorem in Practice

The CAP theorem is central to distributed database design. When a network partition occurs, engineers must decide whether the system prioritizes consistency (all nodes see the same data) or availability (every request gets a response). This tradeoff shapes the architecture of every distributed data store.

## Leader-Based Replication

Many distributed databases use leader-based replication where a single primary node accepts writes and replicates them to secondary nodes. This pattern appears in consensus protocols like Raft and Paxos as well as in database systems like PostgreSQL streaming replication.
