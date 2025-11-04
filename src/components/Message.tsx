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
  const renderContent = () => {
    try {
      const rawHtml = marked.parse(content) as string;
      const cleanHtml = DOMPurify.sanitize(rawHtml);
      return <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
    } catch (error) {
      return <div>{content}</div>;
    }
  };

  return (
    <div className={`message ${role} ${isOriginal ? 'original' : ''}`}>
      <div className="message-header">
        <strong>{role === 'user' ? t('message.user') : t('message.assistant')}</strong>
        {isOriginal && <span className="badge">Original</span>}
      </div>
      <div className="message-content">{renderContent()}</div>
    </div>
  );
};
