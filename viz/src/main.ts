import './ui/studio/look';
import './styles';
import './integration/pipeline.css';
import './ui/studio/studio.css';
import { init } from './ui/app';
import { exposeTestHooks } from './ui/test-hooks';

if (import.meta.env.DEV || import.meta.env.MODE === 'test') exposeTestHooks();
void init();
