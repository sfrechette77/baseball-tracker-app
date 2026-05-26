import { redirect } from 'next/navigation'

export default function FeedRedirect() {
  redirect('/messages?view=announcements')
}