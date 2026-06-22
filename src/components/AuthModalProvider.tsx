import { useModel } from '@umijs/max';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AuthModal from './AuthModal';

export type AuthModalTab = 'login' | 'register';

export type AuthModalOptions = {
  defaultTab?: AuthModalTab;
  title?: string;
  description?: string;
  onSuccess?: () => void | Promise<void>;
};

type AuthModalContextValue = {
  openAuthModal: (options?: AuthModalOptions) => void;
  closeAuthModal: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const { initialState } = useModel('@@initialState');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<AuthModalOptions>({});

  const openAuthModal = useCallback((nextOptions: AuthModalOptions = {}) => {
    // 已经登录的状态下不再弹登录窗(无效场景,且会和 LoginGate re-mount
    // 的 race 互相覆盖,见下方 useEffect 注释)。
    if (initialState?.currentUser) return;
    setOptions(nextOptions);
    setOpen(true);
  }, [initialState?.currentUser]);

  const closeAuthModal = useCallback(() => {
    setOpen(false);
  }, []);

  // 登录窗只服务"未登录"语义:一旦 currentUser 落上,立即强制关。
  // 这里兜底两类 race:
  //   1) applyLoginResult 内 onClose() 已调,但同一批 React 渲染中
  //      LoginGate 的 useEffect 因 StrictMode/重 mount 再次 openAuthModal,
  //      把 open 又推回 true,弹窗永远关不掉。
  //   2) 外部直接灌 token + setInitialState(登录态被其他路径建立),
  //      残留的弹窗也跟着关掉。
  useEffect(() => {
    if (initialState?.currentUser) {
      setOpen(false);
    }
  }, [initialState?.currentUser]);

  const value = useMemo(
    () => ({ openAuthModal, closeAuthModal }),
    [openAuthModal, closeAuthModal],
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModal
        open={open}
        defaultTab={options.defaultTab}
        title={options.title}
        description={options.description}
        onClose={closeAuthModal}
        onSuccess={async () => {
          await options.onSuccess?.();
        }}
      />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) {
    throw new Error('useAuthModal must be used within AuthModalProvider');
  }
  return ctx;
}
