// Message component
import React from 'react';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './Message.css';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  isOriginal?: boolean;
}

export const Message: React.FC<MessageProps> = ({ role, content, isOriginal = false }) => {
  const { t } = useTranslation();
  // Detect warning markers inserted by the orchestrator
  const WARNING_START = '@@WARNING_START@@';
  const WARNING_END = '@@WARNING_END@@';
  let warning: string | null = null;
  let body = content;

  if (content.includes(WARNING_START) && content.includes(WARNING_END)) {
    const start = content.indexOf(WARNING_START) + WARNING_START.length;
    const end = content.indexOf(WARNING_END, start);
    if (end > start) {
      warning = content.substring(start, end).trim();
      // Remove the marker block from the body
      body = content.slice(end + WARNING_END.length).trim();
    }
  }

  const renderContent = () => {
    try {
      const rawHtml = marked.parse(body) as string;
      const cleanHtml = DOMPurify.sanitize(rawHtml);
      return <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
    } catch (error) {
      return <div>{body}</div>;
    }
  };

  return (
    <div className={`message ${role} ${isOriginal ? 'original' : ''}`}>
      <div className="message-header">
        <strong>{role === 'user' ? t('message.user') : t('message.assistant')}</strong>
        {isOriginal && <span className="badge">Original</span>}
      </div>
      {warning && (
        <div className="message-warning" role="status" aria-live="polite">
          {warning}
        </div>
      )}
      <div className="message-content">{renderContent()}</div>
    </div>
  );
};
