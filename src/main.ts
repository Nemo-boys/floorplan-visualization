import './styles';
import { init } from './ui/app';
import { exposeTestHooks } from './ui/test-hooks';

if (import.meta.env.DEV || import.meta.env.MODE === 'test') exposeTestHooks();
init();
