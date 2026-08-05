import { BellOff, ChevronRight, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Avatar, Card, NewDot, Page, TopBar } from '../components/ui'
import { navigate } from '../router'
import { useStore } from '../store'

export function ChatList() {
  const { t } = useTranslation()
  const { state, effectiveRetention, visibleMessages, myGroups, unreadGroups } = useStore()

  return (
    <>
      <TopBar title={t('chat.title')} back="/" />
      <Page>
        <p className="mb-3 text-[13px] font-medium uppercase tracking-wide text-dim">{t('chat.yourGroups')}</p>
        {myGroups.length === 0 && <p className="text-sm text-dim">{t('chat.noGroups')}</p>}
        <div className="space-y-3">
          {myGroups.map((g) => {
            const msgs = visibleMessages(g.id)
            const last = msgs[msgs.length - 1]
            const lastAuthor = last ? state.users.find((u) => u.id === last.authorId) : null
            return (
              <Card key={g.id} onClick={() => navigate(`/chat/${g.id}`)} className="relative flex items-center gap-3 p-4">
                {unreadGroups.has(g.id) && <NewDot className="-right-1 -top-1" />}
                <Avatar name={g.name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-semibold">{g.name}</p>
                    {g.muted && <BellOff size={13} className="shrink-0 text-dim" />}
                  </div>
                  <p className="truncate text-[13px] text-dim">
                    {last ? `${lastAuthor?.name.split(' ')[0]}: ${last.text}` : t('chat.noMessages')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-dim">
                    <Clock size={11} /> {t(`retention.${effectiveRetention(g)}`)}
                  </span>
                  <ChevronRight size={16} className="text-dim" />
                </div>
              </Card>
            )
          })}
        </div>
      </Page>
    </>
  )
}
