// Updated onMessage handler in SellerProfileCard to open chat like Fiverr
export function SellerProfileCard({ seller, onViewProfile, onMessage }: SellerProfileCardProps) {
  // ... existing code ...

  const handleMessage = async () => {
    if (typeof onMessage === 'function') {
      onMessage();
      return;
    }

    try {
      const { getClerkUserId } = await import('@/lib/auth');
      const currentUserId = await getClerkUserId();
      if (!currentUserId) {
        window.location.href = '/sign-in';
        return;
      }

      const { startOrGetConversation } = await import('@/lib/startConversation');
      const convId = await startOrGetConversation(
        currentUserId,
        seller.id,
        // gigId can be passed if available from props
        undefined,
        `Hi, I'm interested in your service.`
      );

      // Open dashboard messages with the conversation pre-selected
      window.location.href = `/dashboard/messages?conversation=${convId}`;
    } catch (e) {
      console.error('Failed to start conversation', e);
      alert('Could not open chat. Please try again.');
    }
  };

  // Replace the button onClick
  // <Btn ... onClick={handleMessage}>
}
