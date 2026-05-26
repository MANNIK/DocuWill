import NavBar from '@/components/NavBar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <div className="flex-1">{children}</div>
    </>
  )
}
