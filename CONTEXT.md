# WhatsApp Clone Backend

Real-time messaging backend, clone of WhatsApp. MVP: chat 1-on-1, group chat, delivery tracking, typing indicator, presence, phone + OTP auth.

## Language

**Conversation**:
A container for messages shared between 2+ users. For 1-on-1, one conversation per user pair. For groups, one conversation per group.
_Avoid_: Chat, thread, channel

**Message**:
A unit of content within a conversation. Types: text, image, video, document.
_Avoid_: Post, item

**MessageStatus**:
Per-user per-message delivery tracking with state machine: sent -> delivered -> read.
_Avoid_: Receipt, delivery state

**User**:
An individual registered with a phone number. The identity primitive of the system.

**Group**:
A conversation with 3+ members. Has a creator (super admin) and admins. Max 256 members.

**Presence**:
Online/offline indicator for a user, plus typing indicator per conversation.
_Avoid_: Status, availability

**DeliveryReceipt**:
Event emitted when a message transitions between statuses (sent, delivered, read). For 1-on-1 only.
_Avoid_: Ack, confirmation

**AuthSession**:
A JWT-based session tied to a phone number verified via OTP. Single device per user for MVP.

**Media**:
Binary content attached to a message: image, video, audio, or document. Stored on local disk with S3-ready abstraction. Max: image 16MB, video 64MB, document 100MB.
