import { useEffect, useState } from 'react'

function App(): React.JSX.Element {
  const [pong, setPong] = useState<string>('...loading')

  useEffect(() => {
    window.api
      .ping()
      .then((v) => setPong(v))
      .catch((e) => setPong('error: ' + String(e)))
  }, [])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>物理教师题库管理系统</h1>
      <p>IPC ping 返回：<b>{pong}</b></p>
    </div>
  )
}

export default App
